'use client';

import { useCallback, useEffect, useState } from 'react';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import type { UploadCommitResponse } from '@trainova/shared';
import { FileDropzone } from '@/components/FileDropzone';
import { deleteAsset } from '@/lib/uploads/client';

export interface AttachmentRow {
  id: string;
  title: string | null;
  mimeType: string;
  byteLength: number;
  scanStatus: 'pending' | 'clean' | 'infected' | string;
  createdAt: string;
}

interface Props {
  applicationId: string;
  /** When false the component is read-only (company viewing trainer's uploads). */
  canEdit: boolean;
}

/**
 * Applicant-side attachments surface. Shown inline after a successful apply
 * so the trainer can immediately attach a CV / portfolio bundle / writing
 * sample. Also used in read-only mode on the company's applicant-detail page.
 *
 * Signed GET URLs are fetched on demand via /uploads/attachments/:id/download
 * so the bucket object keys never reach the client.
 */
export function ApplicationAttachmentsPanel({ applicationId, canEdit }: Props) {
  const t = useTranslations('applications.attachments');
  const locale = useLocale();
  const fmt = useFormatter();
  const [rows, setRows] = useState<AttachmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(
        `/api/proxy/applications/${encodeURIComponent(applicationId)}/attachments`,
        { cache: 'no-store' },
      );
      if (!res.ok) {
        setError(t('errors.list'));
        return;
      }
      const list = (await res.json()) as AttachmentRow[];
      setRows(list);
    } catch {
      setError(t('errors.list'));
    } finally {
      setLoading(false);
    }
  }, [applicationId, t]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleUploaded = useCallback(
    (_committed: UploadCommitResponse) => {
      void refresh();
    },
    [refresh],
  );

  const handleDelete = useCallback(
    async (id: string) => {
      if (!canEdit) return;
      try {
        await deleteAsset({
          kind: 'application-attachment',
          entityId: applicationId,
          assetId: id,
        });
        await refresh();
      } catch {
        setError(t('errors.delete'));
      }
    },
    [applicationId, canEdit, refresh, t],
  );

  const handleDownload = useCallback(
    async (id: string) => {
      setDownloadingId(id);
      try {
        const res = await fetch(
          `/api/proxy/uploads/attachments/${encodeURIComponent(id)}/download`,
        );
        if (!res.ok) {
          setError(t('errors.download'));
          return;
        }
        const body = (await res.json()) as { url: string };
        // Open in a new tab. Signed URL expires quickly so we don't persist it.
        window.open(body.url, '_blank', 'noopener,noreferrer');
      } catch {
        // Network error (offline, CORS, etc.) — surface the same message
        // path the other failures use so callers that `void handleDownload`
        // don't leak an unhandled rejection to the console.
        setError(t('errors.download'));
      } finally {
        setDownloadingId(null);
      }
    },
    [t],
  );

  const dir = locale === 'ar' ? 'rtl' : 'ltr';

  return (
    <section
      dir={dir}
      data-testid="application-attachments"
      className="rounded-2xl border border-slate-200/70 bg-white/80 p-4 shadow-sm backdrop-blur-sm"
    >
      <header className="mb-3 flex items-center justify-between gap-2">
        <div>
          <h3 className="text-base font-semibold text-slate-900">{t('title')}</h3>
          <p className="text-xs text-slate-500">{t('help')}</p>
        </div>
        <span
          aria-hidden
          className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-indigo-500 text-white shadow-sm"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current" strokeWidth="2">
            <path d="M21.44 11.05 12.25 20.24a5.5 5.5 0 1 1-7.78-7.78L13.66 3.28a3.5 3.5 0 1 1 4.95 4.95L9.42 17.41a1.5 1.5 0 1 1-2.12-2.12l7.78-7.78" />
          </svg>
        </span>
      </header>

      {loading ? (
        <p className="text-sm text-slate-500">{t('loading')}</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-slate-500" data-testid="attachments-empty">
          {canEdit ? t('emptyTrainer') : t('emptyCompany')}
        </p>
      ) : (
        <ul className="space-y-2" data-testid="attachments-list">
          {rows.map((r) => (
            <li
              key={r.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium text-slate-800">
                    {r.title ?? r.mimeType}
                  </span>
                  {r.scanStatus === 'pending' ? (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800">
                      {t('scanStatus.pending')}
                    </span>
                  ) : r.scanStatus === 'infected' ? (
                    <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-medium text-rose-800">
                      {t('scanStatus.infected')}
                    </span>
                  ) : (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-800">
                      {t('scanStatus.clean')}
                    </span>
                  )}
                </div>
                <div className="mt-0.5 text-xs text-slate-500">
                  {formatBytes(r.byteLength, locale)} ·{' '}
                  {fmt.dateTime(new Date(r.createdAt), {
                    year: 'numeric',
                    month: 'short',
                    day: '2-digit',
                  })}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void handleDownload(r.id)}
                  disabled={
                    r.scanStatus === 'infected' || downloadingId === r.id
                  }
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-700 shadow-sm transition hover:border-brand-400 hover:text-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
                  data-testid="attachment-download"
                >
                  {downloadingId === r.id ? t('downloading') : t('download')}
                </button>
                {canEdit ? (
                  <button
                    type="button"
                    onClick={() => void handleDelete(r.id)}
                    className="rounded-lg border border-rose-200 bg-white px-3 py-1 text-xs font-medium text-rose-700 shadow-sm transition hover:bg-rose-50"
                    data-testid="attachment-delete"
                  >
                    {t('delete')}
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}

      {canEdit ? (
        <div className="mt-3">
          <FileDropzone
            kind="application-attachment"
            entityId={applicationId}
            label={t('dropzone.label')}
            help={t('dropzone.help')}
            onUploaded={handleUploaded}
            getTitleForFile={(f) => f.name}
            multiple
          />
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="mt-2 text-xs text-rose-700">
          {error}
        </p>
      ) : null}
    </section>
  );
}

function formatBytes(bytes: number, locale: string): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toLocaleString(locale === 'ar' ? 'ar' : 'en', { maximumFractionDigits: 1 })} KB`;
  const mb = kb / 1024;
  return `${mb.toLocaleString(locale === 'ar' ? 'ar' : 'en', { maximumFractionDigits: 1 })} MB`;
}
