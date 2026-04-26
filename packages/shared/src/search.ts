import { z } from 'zod';

/**
 * Marketplace search v2 (T9.L).
 *
 * Rich-query schema and saved-search payloads shared between the API and
 * the web app. The same shape is used:
 *   - on `GET /search/jobs` for ranked listing
 *   - inside `SavedSearch.queryJson` for the daily-alert cron
 *
 * `q` is full-text. The API issues a `to_tsquery` against the `searchVector`
 * generated column on `JobRequest` (created in migration
 * `20260615000000_t9l_search_v2`). For queries shorter than 3 chars we
 * fall back to the legacy `ILIKE` substring filter — `to_tsquery` strips
 * tokens that short and would return everything.
 */

export const SEARCH_MIN_TSQUERY_LEN = 3;
export const SEARCH_MAX_LIMIT = 50;
export const SEARCH_DEFAULT_LIMIT = 20;
export const SAVED_SEARCH_NAME_MAX_LEN = 80;
export const SAVED_SEARCH_PER_USER_LIMIT = 25;

export const workTypeSchema = z.enum(['REMOTE', 'ONSITE', 'HYBRID']);
export type SearchWorkType = z.infer<typeof workTypeSchema>;

export const searchSortSchema = z.enum(['relevance', 'newest', 'budget_high']);
export type SearchSort = z.infer<typeof searchSortSchema>;

/** Filters that can be applied with or without a free-text query. */
export const searchFiltersSchema = z.object({
  q: z.string().trim().max(200).optional(),
  skill: z.string().trim().max(80).optional(),
  industry: z.string().trim().max(80).optional(),
  modelFamily: z.string().trim().max(80).optional(),
  workType: workTypeSchema.optional(),
  currency: z.string().trim().length(3).optional(),
  budgetMin: z.coerce.number().int().nonnegative().optional(),
  budgetMax: z.coerce.number().int().nonnegative().optional(),
  language: z.string().trim().max(20).optional(),
});
export type SearchFilters = z.infer<typeof searchFiltersSchema>;

/** Public search query — filters + paging + sort. */
export const searchJobsQuerySchema = searchFiltersSchema.extend({
  limit: z.coerce.number().int().min(1).max(SEARCH_MAX_LIMIT).optional(),
  offset: z.coerce.number().int().nonnegative().optional(),
  sort: searchSortSchema.optional(),
});
export type SearchJobsQuery = z.infer<typeof searchJobsQuerySchema>;

/** Stored alongside `SavedSearch.queryJson` — paging fields are dropped
 *  because the cron always scans the whole result set. */
export const savedSearchQuerySchema = searchFiltersSchema;
export type SavedSearchQuery = z.infer<typeof savedSearchQuerySchema>;

export const createSavedSearchSchema = z.object({
  name: z.string().trim().min(1).max(SAVED_SEARCH_NAME_MAX_LEN),
  query: savedSearchQuerySchema,
  notifyDaily: z.boolean().default(false),
});
export type CreateSavedSearchInput = z.infer<typeof createSavedSearchSchema>;

export const updateSavedSearchSchema = z.object({
  name: z.string().trim().min(1).max(SAVED_SEARCH_NAME_MAX_LEN).optional(),
  query: savedSearchQuerySchema.optional(),
  notifyDaily: z.boolean().optional(),
});
export type UpdateSavedSearchInput = z.infer<typeof updateSavedSearchSchema>;
