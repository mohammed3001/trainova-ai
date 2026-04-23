import { Injectable, Logger } from '@nestjs/common';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { UploadsConfig } from './uploads.config';

export interface PresignedPut {
  method: 'PUT';
  url: string;
  headers: Record<string, string>;
  expiresAt: Date;
}

export interface HeadResult {
  exists: boolean;
  byteLength?: number;
  mimeType?: string;
}

/**
 * Thin wrapper over the S3 SDK. Exposes the three operations the uploads
 * feature actually needs (presigned PUT, HEAD verify, DELETE) and a presigned
 * GET for private assets. Falls back to a deterministic in-memory stub when
 * OBJECT_STORAGE_* is not configured so dev/CI can exercise the full control
 * flow without a real bucket.
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly client?: S3Client;
  /** In-stub-mode, remembers committed keys so HEAD checks can succeed. */
  private readonly stubObjects = new Map<string, { byteLength: number; mimeType: string }>();

  constructor(private readonly config: UploadsConfig) {
    if (config.isConfigured) {
      this.client = new S3Client({
        endpoint: config.endpoint,
        region: config.region,
        credentials: {
          accessKeyId: config.accessKeyId!,
          secretAccessKey: config.secretAccessKey!,
        },
        // R2 requires path-style access.
        forcePathStyle: true,
      });
    } else {
      this.config.warnIfMisconfigured();
    }
  }

  bucketFor(visibility: 'public' | 'private'): string {
    return visibility === 'public' ? this.config.bucketPublic : this.config.bucketPrivate;
  }

  /**
   * Build a deterministic public URL for an object key. Falls back to a
   * dev-only `https://stub-storage.local/...` URL if the CDN base isn't set.
   */
  publicUrlFor(objectKey: string): string {
    const base = this.config.publicBaseUrl ?? 'https://stub-storage.local';
    return `${base.replace(/\/+$/, '')}/${objectKey}`;
  }

  async presignPut(params: {
    visibility: 'public' | 'private';
    objectKey: string;
    mimeType: string;
    byteLength: number;
    expiresInSeconds: number;
  }): Promise<PresignedPut> {
    const bucket = this.bucketFor(params.visibility);
    const expiresAt = new Date(Date.now() + params.expiresInSeconds * 1000);

    if (!this.client) {
      // Stub: record that we expect this key and return a local placeholder URL.
      this.stubObjects.set(params.objectKey, {
        byteLength: params.byteLength,
        mimeType: params.mimeType,
      });
      return {
        method: 'PUT',
        url: `https://stub-storage.local/put/${bucket}/${params.objectKey}`,
        headers: {
          'Content-Type': params.mimeType,
          'Content-Length': String(params.byteLength),
        },
        expiresAt,
      };
    }

    const cmd = new PutObjectCommand({
      Bucket: bucket,
      Key: params.objectKey,
      ContentType: params.mimeType,
      ContentLength: params.byteLength,
    });
    const url = await getSignedUrl(this.client, cmd, { expiresIn: params.expiresInSeconds });
    return {
      method: 'PUT',
      url,
      headers: {
        'Content-Type': params.mimeType,
        'Content-Length': String(params.byteLength),
      },
      expiresAt,
    };
  }

  async presignGet(params: {
    visibility: 'public' | 'private';
    objectKey: string;
    expiresInSeconds: number;
  }): Promise<string> {
    const bucket = this.bucketFor(params.visibility);
    if (!this.client) {
      return `https://stub-storage.local/get/${bucket}/${params.objectKey}`;
    }
    const cmd = new GetObjectCommand({ Bucket: bucket, Key: params.objectKey });
    return getSignedUrl(this.client, cmd, { expiresIn: params.expiresInSeconds });
  }

  async head(params: {
    visibility: 'public' | 'private';
    objectKey: string;
  }): Promise<HeadResult> {
    const bucket = this.bucketFor(params.visibility);
    if (!this.client) {
      const stub = this.stubObjects.get(params.objectKey);
      return stub
        ? { exists: true, byteLength: stub.byteLength, mimeType: stub.mimeType }
        : { exists: false };
    }
    try {
      const out = await this.client.send(
        new HeadObjectCommand({ Bucket: bucket, Key: params.objectKey }),
      );
      return {
        exists: true,
        byteLength: typeof out.ContentLength === 'number' ? out.ContentLength : undefined,
        mimeType: out.ContentType ?? undefined,
      };
    } catch (err: unknown) {
      const e = err as { name?: string; $metadata?: { httpStatusCode?: number } };
      if (e?.name === 'NotFound' || e?.$metadata?.httpStatusCode === 404) {
        return { exists: false };
      }
      throw err;
    }
  }

  async delete(params: { visibility: 'public' | 'private'; objectKey: string }): Promise<void> {
    const bucket = this.bucketFor(params.visibility);
    if (!this.client) {
      this.stubObjects.delete(params.objectKey);
      this.logger.debug(`[stub] deleted ${bucket}/${params.objectKey}`);
      return;
    }
    await this.client.send(new DeleteObjectCommand({ Bucket: bucket, Key: params.objectKey }));
  }
}
