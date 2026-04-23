'use client';

import { useCallback, useId, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  UPLOAD_QUOTAS,
  type UploadCommitResponse,
  type UploadKind,
} from '@trainova/shared';
import {
  UploadError,
  uploadFile,
  validateClientSide,
  type UploadStage,
} from '@/lib/uploads/client';

interface FileDropzoneProps {
  kind: UploadKind;
  entityId: string;
  /** Shown inside the drop target (e.g. "Drop your logo here"). */
  label: string;
  /** Secondary help line under the label. */
  help?: string;
  /** Called after a successful commit so the parent can refresh. */
  onUploaded: (result: UploadCommitResponse) => void;
  /** Optional title sent with commit (used for portfolio / attachments). */
  getTitleForFile?: (file: File) => string | undefined;
  /** Allow multiple files (trainer portfolio, attachments). */
  multiple?: boolean;
  disabled?: boolean;
  className?: string;
}

/**
 * Reusable drag-and-drop file picker. It owns per-file UI state (stage +
 * error) but not the persisted list — that stays in the parent form so it
 * can mirror server truth after `router.refresh()`.
 */
export function FileDropzone({
  kind,
  entityId,
  label,
  help,
  onUploaded,
  getTitleForFile,
  multiple = false,
  disabled = false,
  className = '',
}: FileDropzoneProps) {
  const t = useTranslations();
  const quota = UPLOAD_QUOTAS[kind];
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  const [dragOver, setDragOver] = useState(false);
  const [stage, setStage] = useState<UploadStage | null>(null);
  const [error, setError] = useState<string | null>(null);

  const acceptAttr = quota.allowedMimes.join(',');

  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      if (disabled) return;
      const list = Array.from(files);
      if (list.length === 0) return;
      setError(null);
      for (const file of list) {
        try {
          validateClientSide(kind, file);
        } catch (err) {
          if (err instanceof UploadError) {
            setError(
              t('profile.uploads.errors.clientValidation', {
                maxKb: Math.round(quota.maxFileSize / 1024),
                types: quota.allowedMimes.map(friendlyMime).join(', '),
              }),
            );
          } else {
            setError(t('common.error'));
          }
          return;
        }
      }

      for (const file of list) {
        try {
          const result = await uploadFile({
            kind,
            entityId,
            file,
            title: getTitleForFile?.(file),
            onStage: setStage,
          });
          onUploaded(result);
        } catch (err) {
          setStage(null);
          if (err instanceof UploadError) {
            setError(errorMessage(err, t));
          } else {
            setError(t('common.error'));
          }
          return;
        }
      }
      setStage(null);
      if (inputRef.current) inputRef.current.value = '';
    },
    [disabled, kind, entityId, getTitleForFile, onUploaded, quota, t],
  );

  function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    void handleFiles(files);
  }

  function onDrop(e: React.DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    setDragOver(false);
    const files = e.dataTransfer?.files;
    if (files && files.length) void handleFiles(files);
  }

  const busy = stage !== null;
  const stageCopy = stage ? t(`profile.uploads.stage.${stage}`) : null;

  return (
    <div className={`space-y-2 ${className}`}>
      <label
        htmlFor={inputId}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={`flex cursor-pointer flex-col items-center justify-center gap-1 rounded-md border-2 border-dashed px-4 py-6 text-center transition ${
          disabled
            ? 'cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400'
            : dragOver
              ? 'border-brand-400 bg-brand-50 text-brand-800'
              : 'border-slate-300 bg-white text-slate-600 hover:border-brand-300 hover:text-brand-700'
        }`}
      >
        <span className="text-sm font-medium">{label}</span>
        {help ? <span className="text-xs text-slate-500">{help}</span> : null}
        <span className="text-xs text-slate-400">
          {t('profile.uploads.limits', {
            maxKb: Math.round(quota.maxFileSize / 1024),
            types: quota.allowedMimes.map(friendlyMime).join(', '),
          })}
        </span>
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          className="sr-only"
          accept={acceptAttr}
          multiple={multiple}
          disabled={disabled || busy}
          onChange={onInputChange}
        />
      </label>
      {busy && stageCopy ? (
        <p role="status" className="text-xs text-brand-700">
          {stageCopy}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-xs text-rose-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function friendlyMime(mime: string): string {
  const [, subtype] = mime.split('/');
  if (!subtype) return mime;
  return subtype.toUpperCase();
}

function errorMessage(
  err: UploadError,
  t: ReturnType<typeof useTranslations>,
): string {
  if (err.status === 429) return t('profile.uploads.errors.rateLimit');
  if (err.status === 413) return t('profile.uploads.errors.tooLarge');
  if (err.status === 415) return t('profile.uploads.errors.unsupportedType');
  if (err.stage === 'presigning') return t('profile.uploads.errors.presignFailed');
  if (err.stage === 'uploading') return t('profile.uploads.errors.uploadFailed');
  if (err.stage === 'committing') return t('profile.uploads.errors.commitFailed');
  return err.message || t('common.error');
}
