import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  SAVED_SEARCH_PER_USER_LIMIT,
  savedSearchQuerySchema,
  type CreateSavedSearchInput,
  type SavedSearchQuery,
  type UpdateSavedSearchInput,
} from '@trainova/shared';
import { Prisma } from '@trainova/db';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { ConfigService } from '@nestjs/config';
import { SearchService } from '../search/search.service';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
/** Max rows we'll surface in a single digest — anything past this is
 *  more noise than signal; the user can refine their query. */
const ALERT_RESULT_LIMIT = 10;

@Injectable()
export class SavedSearchesService {
  private readonly logger = new Logger(SavedSearchesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly search: SearchService,
    private readonly email: EmailService,
    private readonly config: ConfigService,
  ) {}

  // -----------------------------------------------------------------
  // CRUD
  // -----------------------------------------------------------------

  async list(userId: string) {
    return this.prisma.savedSearch.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(userId: string, input: CreateSavedSearchInput) {
    const count = await this.prisma.savedSearch.count({ where: { userId } });
    if (count >= SAVED_SEARCH_PER_USER_LIMIT) {
      throw new BadRequestException(
        `Saved search limit reached (${SAVED_SEARCH_PER_USER_LIMIT}). Delete one before adding another.`,
      );
    }
    const normalised = this.normaliseQuery(input.query);
    const next = input.notifyDaily ? new Date(Date.now() + ONE_DAY_MS) : null;
    return this.prisma.savedSearch.create({
      data: {
        userId,
        name: input.name,
        queryJson: normalised as Prisma.InputJsonValue,
        notifyDaily: input.notifyDaily,
        nextNotifyAt: next,
      },
    });
  }

  async update(userId: string, id: string, input: UpdateSavedSearchInput) {
    const existing = await this.prisma.savedSearch.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Saved search not found');
    if (existing.userId !== userId) throw new ForbiddenException();

    const data: Prisma.SavedSearchUpdateInput = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.query !== undefined) {
      data.queryJson = this.normaliseQuery(input.query) as Prisma.InputJsonValue;
    }
    if (input.notifyDaily !== undefined) {
      data.notifyDaily = input.notifyDaily;
      // Toggling alerts on schedules the first run a day out (so we
      // don't blast the user with everything currently OPEN). Toggling
      // off clears `nextNotifyAt` so the cron skips the row entirely.
      if (input.notifyDaily && !existing.notifyDaily) {
        data.nextNotifyAt = new Date(Date.now() + ONE_DAY_MS);
      } else if (!input.notifyDaily) {
        data.nextNotifyAt = null;
      }
    }
    return this.prisma.savedSearch.update({ where: { id }, data });
  }

  async remove(userId: string, id: string) {
    const existing = await this.prisma.savedSearch.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Saved search not found');
    if (existing.userId !== userId) throw new ForbiddenException();
    await this.prisma.savedSearch.delete({ where: { id } });
  }

  /** Run a saved search now without persisting — used by the "Preview"
   *  button on the saved-searches list page so the user can sanity
   *  check what tomorrow's digest will contain. */
  async preview(userId: string, id: string) {
    const existing = await this.prisma.savedSearch.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Saved search not found');
    if (existing.userId !== userId) throw new ForbiddenException();
    const q = this.parseQueryJson(existing.queryJson);
    return this.search.searchJobsHydrated({ ...q, limit: ALERT_RESULT_LIMIT });
  }

  // -----------------------------------------------------------------
  // Daily-alerts cron
  // -----------------------------------------------------------------

  /**
   * Once an hour we look for saved searches whose `nextNotifyAt`
   * watermark has fallen behind `now()` and process them. We pick up
   * lapsed rows opportunistically so a missed scheduler tick doesn't
   * delay an alert for a full day. The watermark advances by a fixed
   * 24h — so even on catch-up the cadence stays daily-ish, never
   * hourly.
   */
  @Cron(CronExpression.EVERY_HOUR)
  async runDueAlerts(): Promise<void> {
    const now = new Date();
    const due = await this.prisma.savedSearch.findMany({
      where: {
        notifyDaily: true,
        OR: [{ nextNotifyAt: null }, { nextNotifyAt: { lte: now } }],
      },
      take: 100,
      include: { user: { select: { id: true, email: true, name: true, locale: true } } },
    });
    if (due.length === 0) return;
    this.logger.log(`Processing ${due.length} due saved-search alerts`);
    for (const row of due) {
      try {
        await this.processOne(row.id, row.userId);
      } catch (err) {
        this.logger.error(
          `Saved-search alert ${row.id} failed: ${(err as Error).message}`,
        );
      }
    }
  }

  /** Process one saved-search row: query, send email if there are new
   *  matches, advance the watermark either way (so an empty result
   *  doesn't keep retrying on every tick). */
  private async processOne(id: string, _userId: string): Promise<void> {
    const row = await this.prisma.savedSearch.findUnique({
      where: { id },
      include: { user: { select: { id: true, email: true, name: true, locale: true } } },
    });
    if (!row || !row.notifyDaily) return;
    const since = row.lastNotifiedAt ?? row.createdAt;
    const q = this.parseQueryJson(row.queryJson);
    const { ids, total } = await this.search.searchJobIds(
      { ...q, limit: ALERT_RESULT_LIMIT },
      { publishedAfter: since },
    );

    const sentAt = new Date();
    const nextAt = new Date(sentAt.getTime() + ONE_DAY_MS);

    if (ids.length > 0) {
      const items = await this.prisma.jobRequest.findMany({
        where: { id: { in: ids } },
        select: {
          id: true,
          slug: true,
          title: true,
          publishedAt: true,
          company: { select: { name: true } },
        },
      });
      const orderedItems = ids
        .map((rid) => items.find((i) => i.id === rid))
        .filter((i): i is NonNullable<typeof i> => !!i);
      await this.sendDigest(row.user, row.name, orderedItems, total).catch((err) => {
        this.logger.warn(
          `Failed to dispatch digest for saved-search ${row.id}: ${(err as Error).message}`,
        );
      });
    }

    await this.prisma.savedSearch.update({
      where: { id: row.id },
      data: { lastNotifiedAt: sentAt, nextNotifyAt: nextAt },
    });
  }

  private async sendDigest(
    user: { email: string; name: string; locale: string },
    searchName: string,
    items: Array<{ slug: string; title: string; company: { name: string } }>,
    total: number,
  ): Promise<void> {
    const baseUrl = (this.config.get<string>('WEB_URL') ?? 'http://localhost:3000').replace(
      /\/$/,
      '',
    );
    const locale = user.locale === 'ar' ? 'ar' : 'en';
    const subject =
      locale === 'ar'
        ? `${items.length} طلب جديد للبحث "${searchName}"`
        : `${items.length} new request${items.length === 1 ? '' : 's'} for "${searchName}"`;
    const intro =
      locale === 'ar'
        ? `وجدنا ${total} نتيجة جديدة منذ آخر تنبيه. أهم ${items.length}:`
        : `We found ${total} new result${total === 1 ? '' : 's'} since your last alert. Top ${items.length}:`;
    const cta =
      locale === 'ar' ? 'عرض جميع النتائج' : 'View all results';

    const escape = (s: string) =>
      s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const list = items
      .map(
        (it) =>
          `<li><a href="${baseUrl}/${locale}/requests/${encodeURIComponent(
            it.slug,
          )}">${escape(it.title)}</a> — <span>${escape(it.company.name)}</span></li>`,
      )
      .join('');
    const html = `
      <p>${escape(intro)}</p>
      <ul>${list}</ul>
      <p><a href="${baseUrl}/${locale}/settings/saved-searches">${escape(cta)}</a></p>
    `;

    await this.email.sendRaw(user.email, subject, html);
  }

  // -----------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------

  /** Re-validate a `SavedSearchQuery` payload — guards us against
   *  stale rows whose JSON shape predates a schema change. */
  private parseQueryJson(raw: Prisma.JsonValue): SavedSearchQuery {
    const parsed = savedSearchQuerySchema.safeParse(raw);
    if (!parsed.success) return {};
    return parsed.data;
  }

  /** Strip `undefined`/empty strings before persisting so the JSON
   *  stays compact and the cron's `===` comparisons line up. */
  private normaliseQuery(q: SavedSearchQuery): SavedSearchQuery {
    const out: SavedSearchQuery = {};
    if (q.q && q.q.trim()) out.q = q.q.trim();
    if (q.skill) out.skill = q.skill;
    if (q.industry) out.industry = q.industry;
    if (q.modelFamily) out.modelFamily = q.modelFamily;
    if (q.workType) out.workType = q.workType;
    if (q.currency) out.currency = q.currency.toUpperCase();
    if (q.budgetMin != null) out.budgetMin = q.budgetMin;
    if (q.budgetMax != null) out.budgetMax = q.budgetMax;
    if (q.language) out.language = q.language;
    return out;
  }
}
