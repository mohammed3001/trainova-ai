import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Typed accessor for OBJECT_STORAGE_* env. Centralised here so the rest of the
 * module never has to deal with `ConfigService.get<T>(...) | undefined` and we
 * can log a single warning in dev when the storage backend isn't configured.
 */
@Injectable()
export class UploadsConfig {
  private readonly logger = new Logger(UploadsConfig.name);

  constructor(private readonly config: ConfigService) {}

  get endpoint(): string | undefined {
    return this.config.get<string>('OBJECT_STORAGE_ENDPOINT') || undefined;
  }
  get region(): string {
    return this.config.get<string>('OBJECT_STORAGE_REGION') || 'auto';
  }
  get bucketPublic(): string {
    return this.config.get<string>('OBJECT_STORAGE_BUCKET_PUBLIC') || 'trainova-public';
  }
  get bucketPrivate(): string {
    return this.config.get<string>('OBJECT_STORAGE_BUCKET_PRIVATE') || 'trainova-private';
  }
  get publicBaseUrl(): string | undefined {
    return this.config.get<string>('OBJECT_STORAGE_PUBLIC_BASE_URL') || undefined;
  }
  get accessKeyId(): string | undefined {
    return this.config.get<string>('OBJECT_STORAGE_ACCESS_KEY_ID') || undefined;
  }
  get secretAccessKey(): string | undefined {
    return this.config.get<string>('OBJECT_STORAGE_SECRET_ACCESS_KEY') || undefined;
  }
  /**
   * When true, the real S3 client is instantiated. When false (no credentials
   * configured, which is the default in dev/CI), the StorageService falls back
   * to a stub that returns deterministic fake URLs and never touches the
   * network. The API surface is identical either way.
   */
  get isConfigured(): boolean {
    return Boolean(this.endpoint && this.accessKeyId && this.secretAccessKey);
  }

  warnIfMisconfigured(): void {
    if (!this.isConfigured) {
      this.logger.warn(
        'OBJECT_STORAGE_* not configured; uploads run in stub mode (no real S3 calls)',
      );
    }
  }
}
