import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@trainova/db';
import {
  SEARCH_DEFAULT_LIMIT,
  SEARCH_MAX_LIMIT,
  SEARCH_MIN_TSQUERY_LEN,
  type SearchFilters,
  type SearchJobsQuery,
  type SearchSort,
} from '@trainova/shared';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Marketplace search v2 (T9.L) — ranked job-request search backed by a
 * Postgres tsvector generated column on `JobRequest`.
 *
 * Why not stay on `ILIKE`? `ILIKE '%foo%'` can't use an index, so we
 * sequential-scan every OPEN row on every query — fine at 100 rows,
 * unworkable past ~10k. The `searchVector` column (created in migration
 * `20260615000000_t9l_search_v2`) is GIN-indexed and gives true
 * relevance ranking via `ts_rank_cd`, with weights tuned so a hit in
 * the title outranks one in the description.
 *
 * Sponsored listings keep the T7.G ordering: a current
 * `sponsoredUntil > now()` row always sorts above an unsponsored one,
 * regardless of relevance — sponsorship is a tiebreaker, never a
 * relevance boost. (We could let sponsorship multiply rank instead, but
 * that opens a "buy your way past organic results" loophole that hurts
 * trainer trust in the marketplace.)
 */
@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Run a ranked search and return the matching JobRequest IDs in
   * descending sponsorship→rank order, plus the computed total count.
   * The caller hydrates the rows itself so it can choose which related
   * tables to include — the daily-alerts cron, for example, only needs
   * the company name and skill list, while the public listing wants
   * a richer object.
   */
  async searchJobIds(
    query: SearchJobsQuery,
    options: { publishedAfter?: Date | null } = {},
  ): Promise<{ ids: string[]; total: number }> {
    const limit = Math.min(query.limit ?? SEARCH_DEFAULT_LIMIT, SEARCH_MAX_LIMIT);
    const offset = Math.max(query.offset ?? 0, 0);
    const sort: SearchSort = query.sort ?? 'relevance';

    const filterSql = this.buildFilterSql(query, options.publishedAfter ?? null);
    const tsQuery = this.toTsQuery(query.q);

    // ts_rank_cd returns 0 for rows that match all filters but the
    // query text — those must still appear when there's no `q`. We
    // collapse to a constant `1` rank in that branch so the order is
    // deterministic (sponsoredUntil → publishedAt) and the SQL stays
    // a single statement either way.
    const rankExpr = tsQuery
      ? Prisma.sql`ts_rank_cd("searchVector", to_tsquery('simple', ${tsQuery}), 32)`
      : Prisma.sql`1::float`;
    const orderSql = this.buildOrderSql(sort, !!tsQuery);

    const rows = await this.prisma.$queryRaw<Array<{ id: string; rank: number }>>(
      Prisma.sql`
        SELECT
          jr."id" AS id,
          ${rankExpr} AS rank
        FROM "JobRequest" jr
        ${filterSql.where}
        ${orderSql}
        LIMIT ${limit} OFFSET ${offset}
      `,
    );

    const totalRows = await this.prisma.$queryRaw<Array<{ count: bigint }>>(
      Prisma.sql`
        SELECT COUNT(*)::bigint AS count
        FROM "JobRequest" jr
        ${filterSql.where}
      `,
    );
    const total = Number(totalRows[0]?.count ?? 0n);

    return { ids: rows.map((r) => r.id), total };
  }

  /**
   * Convenience helper — runs `searchJobIds` and hydrates rows in the
   * same order, decorated with the sponsored badge so the public
   * listing UI can render without a second query. Mirrors the contract
   * of the legacy `JobRequestsService.listPublic` so callers can swap
   * in-place.
   */
  async searchJobsHydrated(query: SearchJobsQuery) {
    const { ids, total } = await this.searchJobIds(query);
    if (!ids.length) return { items: [], total };
    const rows = await this.prisma.jobRequest.findMany({
      where: { id: { in: ids } },
      include: {
        company: {
          select: {
            id: true,
            slug: true,
            name: true,
            logoUrl: true,
            country: true,
            verified: true,
          },
        },
        skills: { include: { skill: true }, take: 8 },
      },
    });
    const byId = new Map(rows.map((r) => [r.id, r]));
    const ordered = ids.map((id) => byId.get(id)).filter((r): r is NonNullable<typeof r> => !!r);
    const now = new Date();
    return {
      items: ordered.map((row) => ({
        ...row,
        sponsored: row.sponsoredUntil != null && row.sponsoredUntil > now,
      })),
      total,
    };
  }

  // -----------------------------------------------------------------
  // Internals
  // -----------------------------------------------------------------

  /**
   * Build the WHERE clause shared by the result and count queries.
   * `publishedAfter` is used by the daily-alerts cron to limit to rows
   * the saved-search owner hasn't been notified about yet.
   */
  private buildFilterSql(
    f: SearchFilters,
    publishedAfter: Date | null,
  ): { where: Prisma.Sql } {
    const parts: Prisma.Sql[] = [Prisma.sql`jr."status" = 'OPEN'`];

    const tsQuery = this.toTsQuery(f.q);
    if (tsQuery) {
      parts.push(Prisma.sql`jr."searchVector" @@ to_tsquery('simple', ${tsQuery})`);
    } else if (f.q && f.q.trim()) {
      // Short query — fall back to ILIKE on title/description to keep
      // 1-2-letter searches usable. Still uses a btree on the OPEN
      // rows so it isn't catastrophic.
      const like = `%${f.q.trim()}%`;
      parts.push(Prisma.sql`(jr."title" ILIKE ${like} OR jr."description" ILIKE ${like})`);
    }
    if (f.industry) {
      parts.push(Prisma.sql`LOWER(jr."industry") = LOWER(${f.industry})`);
    }
    if (f.modelFamily) {
      parts.push(Prisma.sql`LOWER(jr."modelFamily") = LOWER(${f.modelFamily})`);
    }
    if (f.workType) {
      parts.push(Prisma.sql`jr."workType" = ${f.workType}::"WorkType"`);
    }
    if (f.currency) {
      parts.push(Prisma.sql`jr."currency" = ${f.currency.toUpperCase()}`);
    }
    if (f.budgetMin != null) {
      parts.push(
        Prisma.sql`(jr."budgetMin" IS NULL OR jr."budgetMin" >= ${f.budgetMin})`,
      );
    }
    if (f.budgetMax != null) {
      parts.push(
        Prisma.sql`(jr."budgetMax" IS NULL OR jr."budgetMax" <= ${f.budgetMax})`,
      );
    }
    if (f.language) {
      parts.push(Prisma.sql`${f.language} = ANY(jr."languages")`);
    }
    if (f.skill) {
      parts.push(
        Prisma.sql`EXISTS (
          SELECT 1
          FROM "JobRequestSkill" jrs
          INNER JOIN "Skill" s ON s."id" = jrs."skillId"
          WHERE jrs."requestId" = jr."id" AND s."slug" = ${f.skill}
        )`,
      );
    }
    if (publishedAfter) {
      parts.push(Prisma.sql`jr."publishedAt" > ${publishedAfter}`);
    }

    const joined = parts.reduce<Prisma.Sql>(
      (acc, cur, idx) => (idx === 0 ? cur : Prisma.sql`${acc} AND ${cur}`),
      Prisma.empty,
    );
    return { where: Prisma.sql`WHERE ${joined}` };
  }

  /**
   * `to_tsquery` requires a sanitised expression — we strip everything
   * other than alphanumerics + spaces and join terms with `&`. Returns
   * `null` for short/blank input so the caller knows to fall back to
   * the ILIKE path. Two consequences worth flagging:
   *   - We don't expose Postgres operator syntax to end-users (no `|`
   *     for OR, no `!` for NOT) — that's intentional, the search box
   *     stays plain English.
   *   - The `'simple'` configuration does no stemming, so "develop"
   *     won't match "developer". For a multilingual marketplace this
   *     is the correct trade-off — locale-specific stemming would
   *     mis-tokenise the other 3 of the 4 supported locales.
   */
  private toTsQuery(raw: string | undefined): string | null {
    if (!raw) return null;
    const cleaned = raw
      .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
      .trim()
      .split(/\s+/)
      .filter((t) => t.length > 0);
    if (cleaned.length === 0) return null;
    const joined = cleaned.join(' ');
    if (joined.length < SEARCH_MIN_TSQUERY_LEN) return null;
    // Prefix-match each term so partial typing ("react" → "reactor") still
    // finds reasonable matches. The `:*` flag is `to_tsquery`-specific.
    return cleaned.map((t) => `${t}:*`).join(' & ');
  }

  /**
   * Sponsored boost is applied as a strict tiebreaker (not as a rank
   * multiplier) so an unsponsored highly-relevant request still ranks
   * above a sponsored irrelevant one within the same relevance band.
   * The mirror column `sponsoredUntil` is checked at read-time against
   * `NOW()` to defend against a stale value from a missed expire-tick.
   */
  private buildOrderSql(sort: SearchSort, hasQuery: boolean): Prisma.Sql {
    const sponsoredFirst = Prisma.sql`(jr."sponsoredUntil" IS NOT NULL AND jr."sponsoredUntil" > NOW()) DESC`;

    if (sort === 'newest') {
      return Prisma.sql`ORDER BY ${sponsoredFirst}, jr."publishedAt" DESC NULLS LAST, jr."id" DESC`;
    }
    if (sort === 'budget_high') {
      return Prisma.sql`ORDER BY ${sponsoredFirst}, jr."budgetMax" DESC NULLS LAST, jr."publishedAt" DESC NULLS LAST, jr."id" DESC`;
    }
    // relevance — only meaningful when there's a query; without one we
    // collapse to the same default ordering as `newest`.
    if (hasQuery) {
      return Prisma.sql`ORDER BY ${sponsoredFirst}, rank DESC, jr."publishedAt" DESC NULLS LAST, jr."id" DESC`;
    }
    return Prisma.sql`ORDER BY ${sponsoredFirst}, jr."publishedAt" DESC NULLS LAST, jr."id" DESC`;
  }
}
