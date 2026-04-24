'use server';

import { revalidatePath } from 'next/cache';
import { apiFetch } from './api';
import { getToken } from './session';

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await getToken();
  return apiFetch<T>(path, { ...init, token });
}

function str(fd: FormData, key: string): string {
  const v = fd.get(key);
  return v == null ? '' : String(v);
}

function opt(fd: FormData, key: string): string | undefined {
  const v = str(fd, key).trim();
  return v.length ? v : undefined;
}

function parseLocale(fd: FormData): 'en' | 'ar' {
  const v = str(fd, 'locale');
  if (v !== 'en' && v !== 'ar') throw new Error('Invalid locale');
  return v;
}

function parseInt0(fd: FormData, key: string): number {
  const raw = str(fd, key);
  if (!raw) return 0;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : 0;
}

// ---------------------------------------------------------------------------
// Pages
// ---------------------------------------------------------------------------

const PAGE_STATUSES = new Set(['DRAFT', 'PUBLISHED']);
const PAGE_KINDS = new Set(['PAGE', 'LEGAL']);

function pagePayload(fd: FormData) {
  const status = str(fd, 'status').toUpperCase();
  if (!PAGE_STATUSES.has(status)) throw new Error('Invalid page status');
  const kind = str(fd, 'kind').toUpperCase() || 'PAGE';
  if (!PAGE_KINDS.has(kind)) throw new Error('Invalid page kind');
  const slug = str(fd, 'slug').trim();
  const title = str(fd, 'title').trim();
  const content = str(fd, 'content');
  if (!slug) throw new Error('Slug is required');
  if (!title) throw new Error('Title is required');
  if (!content.trim()) throw new Error('Content is required');
  return {
    slug,
    locale: parseLocale(fd),
    title,
    content,
    metaTitle: opt(fd, 'metaTitle'),
    metaDescription: opt(fd, 'metaDescription'),
    status,
    kind,
  };
}

export async function savePageAction(formData: FormData): Promise<void> {
  const id = str(formData, 'id').trim();
  const body = pagePayload(formData);
  const row = await call<{ id: string }>(
    id ? `/admin/cms/pages/${id}` : `/admin/cms/pages`,
    { method: id ? 'PATCH' : 'POST', body: JSON.stringify(body) },
  );
  revalidatePath(`/[locale]/admin/cms/pages`, 'page');
  if (row?.id) revalidatePath(`/[locale]/admin/cms/pages/${row.id}`, 'page');
}

export async function deletePageAction(formData: FormData): Promise<void> {
  const id = str(formData, 'id').trim();
  if (!id) throw new Error('id is required');
  await call(`/admin/cms/pages/${id}`, { method: 'DELETE' });
  revalidatePath(`/[locale]/admin/cms/pages`, 'page');
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

function categoryPayload(fd: FormData) {
  const slug = str(fd, 'slug').trim();
  const nameEn = str(fd, 'nameEn').trim();
  const nameAr = str(fd, 'nameAr').trim();
  if (!slug) throw new Error('Slug is required');
  if (!nameEn || !nameAr) throw new Error('Both English and Arabic names are required');
  return {
    slug,
    nameEn,
    nameAr,
    descriptionEn: opt(fd, 'descriptionEn'),
    descriptionAr: opt(fd, 'descriptionAr'),
    order: parseInt0(fd, 'order'),
  };
}

export async function saveCategoryAction(formData: FormData): Promise<void> {
  const id = str(formData, 'id').trim();
  const body = categoryPayload(formData);
  await call(id ? `/admin/cms/categories/${id}` : `/admin/cms/categories`, {
    method: id ? 'PATCH' : 'POST',
    body: JSON.stringify(body),
  });
  revalidatePath(`/[locale]/admin/cms/categories`, 'page');
}

export async function deleteCategoryAction(formData: FormData): Promise<void> {
  const id = str(formData, 'id').trim();
  if (!id) throw new Error('id is required');
  await call(`/admin/cms/categories/${id}`, { method: 'DELETE' });
  revalidatePath(`/[locale]/admin/cms/categories`, 'page');
}

// ---------------------------------------------------------------------------
// Articles
// ---------------------------------------------------------------------------

const ARTICLE_STATUSES = new Set(['DRAFT', 'PUBLISHED', 'ARCHIVED']);

function articlePayload(fd: FormData) {
  const status = str(fd, 'status').toUpperCase();
  if (!ARTICLE_STATUSES.has(status)) throw new Error('Invalid article status');
  const slug = str(fd, 'slug').trim();
  const title = str(fd, 'title').trim();
  const content = str(fd, 'content');
  if (!slug) throw new Error('Slug is required');
  if (!title) throw new Error('Title is required');
  if (!content.trim()) throw new Error('Content is required');
  const categoryId = opt(fd, 'categoryId');
  return {
    slug,
    locale: parseLocale(fd),
    title,
    excerpt: opt(fd, 'excerpt'),
    content,
    coverUrl: opt(fd, 'coverUrl'),
    metaTitle: opt(fd, 'metaTitle'),
    metaDescription: opt(fd, 'metaDescription'),
    status,
    categoryId: categoryId ?? null,
  };
}

export async function saveArticleAction(formData: FormData): Promise<void> {
  const id = str(formData, 'id').trim();
  const body = articlePayload(formData);
  const row = await call<{ id: string }>(
    id ? `/admin/cms/articles/${id}` : `/admin/cms/articles`,
    { method: id ? 'PATCH' : 'POST', body: JSON.stringify(body) },
  );
  revalidatePath(`/[locale]/admin/cms/articles`, 'page');
  if (row?.id) revalidatePath(`/[locale]/admin/cms/articles/${row.id}`, 'page');
  // Public blog pages may also need invalidation.
  revalidatePath(`/[locale]/articles`, 'page');
}

export async function deleteArticleAction(formData: FormData): Promise<void> {
  const id = str(formData, 'id').trim();
  if (!id) throw new Error('id is required');
  await call(`/admin/cms/articles/${id}`, { method: 'DELETE' });
  revalidatePath(`/[locale]/admin/cms/articles`, 'page');
  revalidatePath(`/[locale]/articles`, 'page');
}

// ---------------------------------------------------------------------------
// FAQ
// ---------------------------------------------------------------------------

function faqPayload(fd: FormData) {
  const question = str(fd, 'question').trim();
  const answer = str(fd, 'answer').trim();
  if (!question) throw new Error('Question is required');
  if (!answer) throw new Error('Answer is required');
  const section = str(fd, 'section').trim() || 'GENERAL';
  return {
    locale: parseLocale(fd),
    section,
    question,
    answer,
    order: parseInt0(fd, 'order'),
    published: str(fd, 'published') === 'on' || str(fd, 'published') === 'true',
  };
}

export async function saveFaqAction(formData: FormData): Promise<void> {
  const id = str(formData, 'id').trim();
  const body = faqPayload(formData);
  await call(id ? `/admin/cms/faqs/${id}` : `/admin/cms/faqs`, {
    method: id ? 'PATCH' : 'POST',
    body: JSON.stringify(body),
  });
  revalidatePath(`/[locale]/admin/cms/faqs`, 'page');
  revalidatePath(`/[locale]/faq`, 'page');
}

export async function deleteFaqAction(formData: FormData): Promise<void> {
  const id = str(formData, 'id').trim();
  if (!id) throw new Error('id is required');
  await call(`/admin/cms/faqs/${id}`, { method: 'DELETE' });
  revalidatePath(`/[locale]/admin/cms/faqs`, 'page');
  revalidatePath(`/[locale]/faq`, 'page');
}

// ---------------------------------------------------------------------------
// Feature flags
// ---------------------------------------------------------------------------

export async function saveFeatureFlagAction(formData: FormData): Promise<void> {
  const key = str(formData, 'key').trim();
  if (!key) throw new Error('Key is required');
  const enabled =
    str(formData, 'enabled') === 'on' || str(formData, 'enabled') === 'true';
  const description = opt(formData, 'description');
  const payloadRaw = str(formData, 'payload').trim();
  let payload: unknown = null;
  if (payloadRaw) {
    try {
      payload = JSON.parse(payloadRaw);
    } catch {
      throw new Error('Payload must be valid JSON');
    }
  }
  await call(`/admin/cms/feature-flags`, {
    method: 'POST',
    body: JSON.stringify({ key, enabled, description, payload }),
  });
  revalidatePath(`/[locale]/admin/cms/feature-flags`, 'page');
}

export async function deleteFeatureFlagAction(formData: FormData): Promise<void> {
  const key = str(formData, 'key').trim();
  if (!key) throw new Error('key is required');
  await call(`/admin/cms/feature-flags/${encodeURIComponent(key)}`, { method: 'DELETE' });
  revalidatePath(`/[locale]/admin/cms/feature-flags`, 'page');
}
