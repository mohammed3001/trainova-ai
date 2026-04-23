/**
 * Browser-side helper that drives the presign → PUT → commit flow.
 *
 * Bytes bypass the Next.js proxy and go straight from the browser to the
 * object-storage bucket; only the small presign and commit JSON round-trips
 * go through `/api/proxy/uploads/*`. See docs/10-tier1e-uploads-spec.md §2.1
 * and PR B1 for the server contract.
 */

import {
  UPLOAD_QUOTAS,
  isAllowedMime,
  type UploadCommitResponse,
  type UploadKind,
  type UploadPresignResponse,
} from '@trainova/shared';

export type UploadStage = 'validating' | 'presigning' | 'uploading' | 'committing';

export class UploadError extends Error {
  readonly stage: UploadStage;
  readonly status?: number;

  constructor(message: string, stage: UploadStage, status?: number) {
    super(message);
    this.name = 'UploadError';
    this.stage = stage;
    this.status = status;
  }
}

export interface UploadFileParams {
  kind: UploadKind;
  /** Entity that will own the asset: companyId, userId, profileId, applicationId. */
  entityId: string;
  file: File;
  /** Optional display title (trainer portfolio / application attachments). */
  title?: string;
  /** Called between stages so the UI can render progress copy. */
  onStage?: (stage: UploadStage) => void;
}

/** Shallow validator used by dropzones *before* a network call. Keeps the
 * server contract authoritative but gives immediate feedback. */
export function validateClientSide(kind: UploadKind, file: File): void {
  const quota = UPLOAD_QUOTAS[kind];
  if (!isAllowedMime(kind, file.type)) {
    throw new UploadError(
      `MIME ${file.type || 'unknown'} not allowed for ${kind}`,
      'validating',
    );
  }
  if (file.size <= 0 || file.size > quota.maxFileSize) {
    throw new UploadError(
      `File exceeds max size (${quota.maxFileSize} bytes)`,
      'validating',
    );
  }
}

async function parseJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return {};
  }
}

function messageFromBody(body: unknown, fallback: string): string {
  if (body && typeof body === 'object' && 'message' in body) {
    const msg = (body as { message?: unknown }).message;
    if (typeof msg === 'string') return msg;
    if (Array.isArray(msg) && typeof msg[0] === 'string') return msg[0];
  }
  return fallback;
}

async function presign(params: UploadFileParams): Promise<UploadPresignResponse> {
  const res = await fetch('/api/proxy/uploads/presign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      kind: params.kind,
      entityId: params.entityId,
      mimeType: params.file.type,
      byteLength: params.file.size,
      fileName: params.file.name,
    }),
  });
  const body = await parseJson(res);
  if (!res.ok) {
    throw new UploadError(messageFromBody(body, 'presign failed'), 'presigning', res.status);
  }
  return body as UploadPresignResponse;
}

async function putToStorage(signed: UploadPresignResponse, file: File): Promise<void> {
  const res = await fetch(signed.url, {
    method: 'PUT',
    headers: signed.headers,
    body: file,
  });
  if (!res.ok) {
    throw new UploadError(
      `storage PUT returned HTTP ${res.status}`,
      'uploading',
      res.status,
    );
  }
}

async function commit(
  params: UploadFileParams,
  signed: UploadPresignResponse,
): Promise<UploadCommitResponse> {
  const res = await fetch('/api/proxy/uploads/commit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      kind: params.kind,
      entityId: params.entityId,
      objectKey: signed.objectKey,
      mimeType: params.file.type,
      byteLength: params.file.size,
      title: params.title,
    }),
  });
  const body = await parseJson(res);
  if (!res.ok) {
    throw new UploadError(messageFromBody(body, 'commit failed'), 'committing', res.status);
  }
  return body as UploadCommitResponse;
}

/**
 * Runs the full presign → PUT → commit sequence for a single file. Each stage
 * is reported via {@link UploadFileParams.onStage} so the UI can swap copy.
 * Errors are raised as {@link UploadError} with the failing stage attached.
 */
export async function uploadFile(params: UploadFileParams): Promise<UploadCommitResponse> {
  params.onStage?.('validating');
  validateClientSide(params.kind, params.file);

  params.onStage?.('presigning');
  const signed = await presign(params);

  params.onStage?.('uploading');
  await putToStorage(signed, params.file);

  params.onStage?.('committing');
  return commit(params, signed);
}

export async function deleteAsset(params: {
  kind: UploadKind;
  entityId: string;
  assetId: string;
}): Promise<void> {
  const { kind, entityId, assetId } = params;
  const res = await fetch(
    `/api/proxy/uploads/${encodeURIComponent(kind)}/${encodeURIComponent(
      entityId,
    )}/${encodeURIComponent(assetId)}`,
    { method: 'DELETE' },
  );
  if (!res.ok) {
    const body = await parseJson(res);
    throw new UploadError(messageFromBody(body, 'delete failed'), 'committing', res.status);
  }
}
