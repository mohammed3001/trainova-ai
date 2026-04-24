import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AUDIT_ACTIONS } from '@trainova/shared';
import type {
  AdminListArticlesQuery,
  AdminListFaqQuery,
  AdminListPagesQuery,
  UpsertArticleInput,
  UpsertCategoryInput,
  UpsertFaqEntryInput,
  UpsertFeatureFlagInput,
  UpsertPageInput,
} from '@trainova/shared';
import { Prisma } from '@trainova/db';
import { PrismaService } from '../prisma/prisma.service';
import type { AdminContext } from '../admin/admin.service';

function clampLimit(v: number | undefined, fallback = 50, max = 100): number {
  const n = Number.isFinite(v) ? Math.floor(v as number) : fallback;
  if (n < 1) return 1;
  if (n > max) return max;
  return n;
}

/**
 * T5.C CMS service — admin-side CRUD for pages, blog articles + categories,
 * FAQ entries, and feature flags. Kept separate from `AdminService` to
 * keep each module small; `AdminController` composes both.
 *
 * Every mutation writes a matching `AuditLog` row so the admin timeline
 * can reconstruct what changed.
 */
@Injectable()
export class CmsService {
  constructor(private readonly prisma: PrismaService) {}

  // ---------------------------------------------------------------------------
  // Pages
  // ---------------------------------------------------------------------------

  async listPages(q: AdminListPagesQuery) {
    const take = clampLimit(q.limit);
    const where: Prisma.PageWhereInput = {};
    if (q.locale) where.locale = q.locale;
    if (q.status) where.status = q.status;
    if (q.kind) where.kind = q.kind;
    if (q.q && q.q.trim()) {
      const term = q.q.trim();
      where.OR = [
        { title: { contains: term, mode: 'insensitive' } },
        { slug: { contains: term, mode: 'insensitive' } },
        { content: { contains: term, mode: 'insensitive' } },
      ];
    }
    const rows = await this.prisma.page.findMany({
      where,
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: take + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
      select: {
        id: true,
        slug: true,
        locale: true,
        title: true,
        status: true,
        kind: true,
        metaTitle: true,
        metaDescription: true,
        updatedAt: true,
        createdAt: true,
      },
    });
    const hasMore = rows.length > take;
    const items = hasMore ? rows.slice(0, take) : rows;
    return { items, nextCursor: hasMore ? items[items.length - 1]!.id : null };
  }

  async getPage(id: string) {
    const row = await this.prisma.page.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Page not found');
    return row;
  }

  async upsertPage(ctx: AdminContext, id: string | null, input: UpsertPageInput) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const row = id
          ? await tx.page.update({
              where: { id },
              data: {
                slug: input.slug,
                locale: input.locale,
                title: input.title,
                content: input.content,
                metaTitle: input.metaTitle ?? null,
                metaDescription: input.metaDescription ?? null,
                status: input.status,
                kind: input.kind,
              },
            })
          : await tx.page.create({
              data: {
                slug: input.slug,
                locale: input.locale,
                title: input.title,
                content: input.content,
                metaTitle: input.metaTitle ?? null,
                metaDescription: input.metaDescription ?? null,
                status: input.status,
                kind: input.kind,
              },
            });
        await tx.auditLog.create({
          data: {
            actorId: ctx.actorId,
            action: id ? AUDIT_ACTIONS.CMS_PAGE_UPDATED : AUDIT_ACTIONS.CMS_PAGE_CREATED,
            entityType: 'Page',
            entityId: row.id,
            ip: ctx.ip ?? null,
            diff: { slug: row.slug, locale: row.locale, status: row.status, kind: row.kind },
          },
        });
        return row;
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new BadRequestException('A page with this slug + locale already exists');
      }
      throw err;
    }
  }

  async deletePage(ctx: AdminContext, id: string) {
    const row = await this.prisma.page.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Page not found');
    await this.prisma.$transaction([
      this.prisma.page.delete({ where: { id } }),
      this.prisma.auditLog.create({
        data: {
          actorId: ctx.actorId,
          action: AUDIT_ACTIONS.CMS_PAGE_DELETED,
          entityType: 'Page',
          entityId: id,
          ip: ctx.ip ?? null,
          diff: { slug: row.slug, locale: row.locale },
        },
      }),
    ]);
    return { ok: true };
  }

  // ---------------------------------------------------------------------------
  // Categories
  // ---------------------------------------------------------------------------

  listCategories() {
    return this.prisma.category.findMany({
      orderBy: [{ order: 'asc' }, { nameEn: 'asc' }],
      include: { _count: { select: { articles: true } } },
    });
  }

  async getCategory(id: string) {
    const row = await this.prisma.category.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Category not found');
    return row;
  }

  async upsertCategory(ctx: AdminContext, id: string | null, input: UpsertCategoryInput) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const row = id
          ? await tx.category.update({ where: { id }, data: input })
          : await tx.category.create({ data: input });
        await tx.auditLog.create({
          data: {
            actorId: ctx.actorId,
            action: id
              ? AUDIT_ACTIONS.CMS_CATEGORY_UPDATED
              : AUDIT_ACTIONS.CMS_CATEGORY_CREATED,
            entityType: 'Category',
            entityId: row.id,
            ip: ctx.ip ?? null,
            diff: { slug: row.slug },
          },
        });
        return row;
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new BadRequestException('A category with this slug already exists');
      }
      throw err;
    }
  }

  async deleteCategory(ctx: AdminContext, id: string) {
    const row = await this.prisma.category.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Category not found');
    // Articles are detached (onDelete: SetNull) — they don't block the delete.
    await this.prisma.$transaction([
      this.prisma.category.delete({ where: { id } }),
      this.prisma.auditLog.create({
        data: {
          actorId: ctx.actorId,
          action: AUDIT_ACTIONS.CMS_CATEGORY_DELETED,
          entityType: 'Category',
          entityId: id,
          ip: ctx.ip ?? null,
          diff: { slug: row.slug },
        },
      }),
    ]);
    return { ok: true };
  }

  // ---------------------------------------------------------------------------
  // Articles
  // ---------------------------------------------------------------------------

  async listArticles(q: AdminListArticlesQuery) {
    const take = clampLimit(q.limit);
    const where: Prisma.ArticleWhereInput = {};
    if (q.locale) where.locale = q.locale;
    if (q.status) where.status = q.status;
    if (q.categoryId) where.categoryId = q.categoryId;
    if (q.q && q.q.trim()) {
      const term = q.q.trim();
      where.OR = [
        { title: { contains: term, mode: 'insensitive' } },
        { slug: { contains: term, mode: 'insensitive' } },
        { excerpt: { contains: term, mode: 'insensitive' } },
      ];
    }
    const rows = await this.prisma.article.findMany({
      where,
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: take + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
      include: {
        category: { select: { id: true, slug: true, nameEn: true, nameAr: true } },
      },
    });
    const hasMore = rows.length > take;
    const items = hasMore ? rows.slice(0, take) : rows;
    return { items, nextCursor: hasMore ? items[items.length - 1]!.id : null };
  }

  async getArticle(id: string) {
    const row = await this.prisma.article.findUnique({
      where: { id },
      include: { category: true },
    });
    if (!row) throw new NotFoundException('Article not found');
    return row;
  }

  async upsertArticle(ctx: AdminContext, id: string | null, input: UpsertArticleInput) {
    // Transition DRAFT -> PUBLISHED stamps publishedAt automatically.
    const existing = id
      ? await this.prisma.article.findUnique({
          where: { id },
          select: { status: true, publishedAt: true },
        })
      : null;
    let publishedAt: Date | null | undefined = undefined;
    if (input.status === 'PUBLISHED') {
      publishedAt = existing?.publishedAt ?? new Date();
    } else if (input.status === 'DRAFT' || input.status === 'ARCHIVED') {
      publishedAt = null;
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const data = {
          slug: input.slug,
          locale: input.locale,
          title: input.title,
          excerpt: input.excerpt ?? null,
          content: input.content,
          coverUrl: input.coverUrl ?? null,
          metaTitle: input.metaTitle ?? null,
          metaDescription: input.metaDescription ?? null,
          status: input.status,
          categoryId: input.categoryId ?? null,
          ...(publishedAt !== undefined ? { publishedAt } : {}),
          ...(id ? {} : { authorId: ctx.actorId }),
        };
        const row = id
          ? await tx.article.update({ where: { id }, data })
          : await tx.article.create({ data });
        await tx.auditLog.create({
          data: {
            actorId: ctx.actorId,
            action: id
              ? AUDIT_ACTIONS.CMS_ARTICLE_UPDATED
              : AUDIT_ACTIONS.CMS_ARTICLE_CREATED,
            entityType: 'Article',
            entityId: row.id,
            ip: ctx.ip ?? null,
            diff: { slug: row.slug, locale: row.locale, status: row.status },
          },
        });
        return row;
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new BadRequestException('An article with this slug + locale already exists');
      }
      throw err;
    }
  }

  async deleteArticle(ctx: AdminContext, id: string) {
    const row = await this.prisma.article.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Article not found');
    await this.prisma.$transaction([
      this.prisma.article.delete({ where: { id } }),
      this.prisma.auditLog.create({
        data: {
          actorId: ctx.actorId,
          action: AUDIT_ACTIONS.CMS_ARTICLE_DELETED,
          entityType: 'Article',
          entityId: id,
          ip: ctx.ip ?? null,
          diff: { slug: row.slug, locale: row.locale },
        },
      }),
    ]);
    return { ok: true };
  }

  // ---------------------------------------------------------------------------
  // FAQ
  // ---------------------------------------------------------------------------

  async listFaq(q: AdminListFaqQuery) {
    const take = clampLimit(q.limit, 100, 200);
    const where: Prisma.FaqEntryWhereInput = {};
    if (q.locale) where.locale = q.locale;
    if (q.section) where.section = q.section;
    if (q.published !== undefined) where.published = q.published;
    if (q.q && q.q.trim()) {
      const term = q.q.trim();
      where.OR = [
        { question: { contains: term, mode: 'insensitive' } },
        { answer: { contains: term, mode: 'insensitive' } },
      ];
    }
    const rows = await this.prisma.faqEntry.findMany({
      where,
      orderBy: [{ locale: 'asc' }, { section: 'asc' }, { order: 'asc' }, { id: 'asc' }],
      take: take + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
    });
    const hasMore = rows.length > take;
    const items = hasMore ? rows.slice(0, take) : rows;
    return { items, nextCursor: hasMore ? items[items.length - 1]!.id : null };
  }

  async getFaq(id: string) {
    const row = await this.prisma.faqEntry.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('FAQ entry not found');
    return row;
  }

  async upsertFaq(ctx: AdminContext, id: string | null, input: UpsertFaqEntryInput) {
    return this.prisma.$transaction(async (tx) => {
      const row = id
        ? await tx.faqEntry.update({ where: { id }, data: input })
        : await tx.faqEntry.create({ data: input });
      await tx.auditLog.create({
        data: {
          actorId: ctx.actorId,
          action: id ? AUDIT_ACTIONS.CMS_FAQ_UPDATED : AUDIT_ACTIONS.CMS_FAQ_CREATED,
          entityType: 'FaqEntry',
          entityId: row.id,
          ip: ctx.ip ?? null,
          diff: { locale: row.locale, section: row.section, published: row.published },
        },
      });
      return row;
    });
  }

  async deleteFaq(ctx: AdminContext, id: string) {
    const row = await this.prisma.faqEntry.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('FAQ entry not found');
    await this.prisma.$transaction([
      this.prisma.faqEntry.delete({ where: { id } }),
      this.prisma.auditLog.create({
        data: {
          actorId: ctx.actorId,
          action: AUDIT_ACTIONS.CMS_FAQ_DELETED,
          entityType: 'FaqEntry',
          entityId: id,
          ip: ctx.ip ?? null,
          diff: { locale: row.locale, section: row.section },
        },
      }),
    ]);
    return { ok: true };
  }

  // ---------------------------------------------------------------------------
  // Feature flags
  // ---------------------------------------------------------------------------

  listFeatureFlags() {
    return this.prisma.featureFlag.findMany({ orderBy: { key: 'asc' } });
  }

  async getFeatureFlag(key: string) {
    const row = await this.prisma.featureFlag.findUnique({ where: { key } });
    if (!row) throw new NotFoundException('Feature flag not found');
    return row;
  }

  async upsertFeatureFlag(ctx: AdminContext, input: UpsertFeatureFlagInput) {
    const payload =
      input.payload == null ? Prisma.JsonNull : (input.payload as Prisma.InputJsonValue);
    const row = await this.prisma.$transaction(async (tx) => {
      const existed = await tx.featureFlag.findUnique({ where: { key: input.key } });
      const upserted = await tx.featureFlag.upsert({
        where: { key: input.key },
        update: {
          description: input.description ?? null,
          enabled: input.enabled,
          payload,
          updatedBy: ctx.actorId,
        },
        create: {
          key: input.key,
          description: input.description ?? null,
          enabled: input.enabled,
          payload,
          updatedBy: ctx.actorId,
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: ctx.actorId,
          action: existed
            ? AUDIT_ACTIONS.FEATURE_FLAG_UPDATED
            : AUDIT_ACTIONS.FEATURE_FLAG_CREATED,
          entityType: 'FeatureFlag',
          entityId: upserted.key,
          ip: ctx.ip ?? null,
          diff: { key: upserted.key, enabled: upserted.enabled },
        },
      });
      return upserted;
    });
    return row;
  }

  async deleteFeatureFlag(ctx: AdminContext, key: string) {
    const row = await this.prisma.featureFlag.findUnique({ where: { key } });
    if (!row) throw new NotFoundException('Feature flag not found');
    await this.prisma.$transaction([
      this.prisma.featureFlag.delete({ where: { key } }),
      this.prisma.auditLog.create({
        data: {
          actorId: ctx.actorId,
          action: AUDIT_ACTIONS.FEATURE_FLAG_DELETED,
          entityType: 'FeatureFlag',
          entityId: key,
          ip: ctx.ip ?? null,
          diff: { key },
        },
      }),
    ]);
    return { ok: true };
  }

  // ---------------------------------------------------------------------------
  // Public read APIs (unauthenticated)
  // ---------------------------------------------------------------------------

  async publicArticles(locale: 'en' | 'ar', cursor?: string, limit = 20) {
    const take = clampLimit(limit, 20, 50);
    const rows = await this.prisma.article.findMany({
      where: { locale, status: 'PUBLISHED' },
      orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: {
        category: { select: { id: true, slug: true, nameEn: true, nameAr: true } },
      },
    });
    const hasMore = rows.length > take;
    const items = hasMore ? rows.slice(0, take) : rows;
    return { items, nextCursor: hasMore ? items[items.length - 1]!.id : null };
  }

  async publicArticleBySlug(slug: string, locale: 'en' | 'ar') {
    const row = await this.prisma.article.findUnique({
      where: { slug_locale: { slug, locale } },
      include: {
        category: { select: { id: true, slug: true, nameEn: true, nameAr: true } },
      },
    });
    if (!row || row.status !== 'PUBLISHED') throw new NotFoundException('Article not found');
    return row;
  }

  publicFaq(locale: 'en' | 'ar') {
    return this.prisma.faqEntry.findMany({
      where: { locale, published: true },
      orderBy: [{ section: 'asc' }, { order: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        section: true,
        question: true,
        answer: true,
        order: true,
      },
    });
  }

  publicCategories() {
    return this.prisma.category.findMany({
      orderBy: [{ order: 'asc' }, { nameEn: 'asc' }],
      include: { _count: { select: { articles: { where: { status: 'PUBLISHED' } } } } },
    });
  }
}
