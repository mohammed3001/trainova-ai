import { randomBytes } from 'node:crypto';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AUDIT_ACTIONS,
  UPLOAD_QUOTAS,
  isAllowedMime,
  type UploadKind,
  type UploadPresignRequest,
  type UploadPresignResponse,
  type UploadCommitRequest,
  type UploadCommitResponse,
} from '@trainova/shared';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from './storage.service';
import { ScannerService } from './scanner.service';
import { ImageProcessorService } from './image-processor.service';

const PRESIGN_TTL_SECONDS = 300; // 5 min
const PRIVATE_GET_TTL_SECONDS = 300;
const SIGNED_KEY_BYTES = 24;

interface OwnedEntity {
  /** The actual id we write to DB rows (always the entity's own PK). */
  entityId: string;
  /** trainerProfileId when kind=trainer-asset — needed for directory naming. */
  profileId?: string;
}

@Injectable()
export class UploadsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly scanner: ScannerService,
    private readonly imageProcessor: ImageProcessorService,
  ) {}

  // ---------------------------------------------------------------------------
  // Presign
  // ---------------------------------------------------------------------------

  async presign(userId: string, input: UploadPresignRequest): Promise<UploadPresignResponse> {
    this.assertMimeAndSize(input.kind, input.mimeType, input.byteLength);
    const owned = await this.assertOwnership(userId, input.kind, input.entityId);
    await this.assertBelowMaxCount(input.kind, owned);

    const objectKey = this.buildObjectKey(input.kind, owned, input.mimeType);
    const visibility = UPLOAD_QUOTAS[input.kind].visibility;

    const presigned = await this.storage.presignPut({
      visibility,
      objectKey,
      mimeType: input.mimeType,
      byteLength: input.byteLength,
      expiresInSeconds: PRESIGN_TTL_SECONDS,
    });

    return {
      method: 'PUT',
      url: presigned.url,
      headers: presigned.headers,
      objectKey,
      expiresAt: presigned.expiresAt.toISOString(),
      expectedPublicUrl:
        visibility === 'public' ? this.storage.publicUrlFor(objectKey) : undefined,
      maxByteLength: UPLOAD_QUOTAS[input.kind].maxFileSize,
    };
  }

  // ---------------------------------------------------------------------------
  // Commit
  // ---------------------------------------------------------------------------

  async commit(userId: string, input: UploadCommitRequest): Promise<UploadCommitResponse> {
    this.assertMimeAndSize(input.kind, input.mimeType, input.byteLength);
    const owned = await this.assertOwnership(userId, input.kind, input.entityId);
    this.assertObjectKeyBelongsTo(input.kind, owned, input.objectKey);

    const quota = UPLOAD_QUOTAS[input.kind];

    // HEAD the object to prove it was actually PUT to storage with the expected
    // size/MIME. Clients can't fabricate commits for keys they never uploaded.
    const head = await this.storage.head({
      visibility: quota.visibility,
      objectKey: input.objectKey,
    });
    if (!head.exists) {
      throw new BadRequestException('Uploaded object not found; upload it before commit');
    }
    if (typeof head.byteLength === 'number' && head.byteLength !== input.byteLength) {
      throw new BadRequestException('Stored byteLength does not match commit payload');
    }
    if (typeof head.byteLength === 'number' && head.byteLength > quota.maxFileSize) {
      throw new BadRequestException('Stored object exceeds max file size');
    }

    const url =
      quota.visibility === 'public' ? this.storage.publicUrlFor(input.objectKey) : '';

    switch (input.kind) {
      case 'company-logo':
        return this.commitCompanyLogo(userId, owned.entityId, input, url);
      case 'trainer-avatar':
        return this.commitTrainerAvatar(userId, input, url);
      case 'trainer-asset':
        return this.commitTrainerAsset(userId, owned.profileId!, input, url);
      case 'application-attachment':
        return this.commitApplicationAttachment(userId, owned.entityId, input);
      default:
        throw new BadRequestException('Unsupported kind');
    }
  }

  // ---------------------------------------------------------------------------
  // Delete
  // ---------------------------------------------------------------------------

  async delete(
    userId: string,
    kind: UploadKind,
    entityId: string,
    assetId: string,
  ): Promise<{ ok: true }> {
    const owned = await this.assertOwnership(userId, kind, entityId);

    switch (kind) {
      case 'company-logo': {
        const company = await this.prisma.company.findUnique({ where: { id: owned.entityId } });
        if (!company) throw new NotFoundException('Company not found');
        const previousUrl = company.logoUrl;
        const previousKey = this.extractObjectKeyFromPublicUrl(previousUrl);
        if (!previousUrl || assetId !== 'current') {
          throw new NotFoundException('Logo not found');
        }
        await this.prisma.company.update({
          where: { id: company.id },
          data: { logoUrl: null },
        });
        await this.writeAudit(userId, kind, owned.entityId, AUDIT_ACTIONS.ASSET_DELETED, {
          objectKey: previousKey,
        });
        if (previousKey) {
          void this.storage.delete({ visibility: 'public', objectKey: previousKey });
        }
        return { ok: true };
      }

      case 'trainer-avatar': {
        const user = await this.prisma.user.findUnique({ where: { id: owned.entityId } });
        if (!user) throw new NotFoundException('User not found');
        const previousKey = this.extractObjectKeyFromPublicUrl(user.avatarUrl);
        if (!user.avatarUrl || assetId !== 'current') {
          throw new NotFoundException('Avatar not found');
        }
        await this.prisma.user.update({
          where: { id: user.id },
          data: { avatarUrl: null },
        });
        await this.writeAudit(userId, kind, owned.entityId, AUDIT_ACTIONS.ASSET_DELETED, {
          objectKey: previousKey,
        });
        if (previousKey) {
          void this.storage.delete({ visibility: 'public', objectKey: previousKey });
        }
        return { ok: true };
      }

      case 'trainer-asset': {
        const asset = await this.prisma.trainerAsset.findUnique({ where: { id: assetId } });
        if (!asset || asset.deletedAt || asset.profileId !== owned.profileId) {
          throw new NotFoundException('Asset not found');
        }
        await this.prisma.trainerAsset.update({
          where: { id: asset.id },
          data: { deletedAt: new Date() },
        });
        await this.writeAudit(userId, kind, owned.profileId!, AUDIT_ACTIONS.ASSET_DELETED, {
          assetId,
          objectKey: asset.objectKey,
        });
        void this.storage.delete({ visibility: 'public', objectKey: asset.objectKey });
        return { ok: true };
      }

      case 'application-attachment': {
        const att = await this.prisma.applicationAttachment.findUnique({
          where: { id: assetId },
        });
        if (!att || att.deletedAt || att.applicationId !== owned.entityId) {
          throw new NotFoundException('Attachment not found');
        }
        await this.prisma.applicationAttachment.update({
          where: { id: att.id },
          data: { deletedAt: new Date() },
        });
        await this.writeAudit(userId, kind, owned.entityId, AUDIT_ACTIONS.ASSET_DELETED, {
          assetId,
          objectKey: att.objectKey,
        });
        void this.storage.delete({ visibility: 'private', objectKey: att.objectKey });
        return { ok: true };
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Private-asset read (signed GET)
  // ---------------------------------------------------------------------------

  async getAttachmentDownloadUrl(userId: string, attachmentId: string): Promise<{ url: string; expiresAt: string }> {
    const att = await this.prisma.applicationAttachment.findUnique({
      where: { id: attachmentId },
      include: {
        application: {
          include: { request: { include: { company: { select: { ownerId: true } } } } },
        },
      },
    });
    if (!att || att.deletedAt) throw new NotFoundException('Attachment not found');
    if (att.scanStatus === 'infected') {
      throw new ForbiddenException('Attachment is flagged and cannot be downloaded');
    }

    const isTrainer = att.application.trainerId === userId;
    const isOwner = att.application.request.company.ownerId === userId;
    if (!isTrainer && !isOwner) {
      throw new ForbiddenException('Not allowed to download this attachment');
    }

    const url = await this.storage.presignGet({
      visibility: 'private',
      objectKey: att.objectKey,
      expiresInSeconds: PRIVATE_GET_TTL_SECONDS,
    });
    return {
      url,
      expiresAt: new Date(Date.now() + PRIVATE_GET_TTL_SECONDS * 1000).toISOString(),
    };
  }

  // ---------------------------------------------------------------------------
  // Commit handlers (TOCTOU-safe for mutable rows)
  // ---------------------------------------------------------------------------

  private async commitCompanyLogo(
    userId: string,
    companyId: string,
    input: UploadCommitRequest,
    url: string,
  ): Promise<UploadCommitResponse> {
    const company = await this.prisma.company.findUnique({ where: { id: companyId } });
    if (!company) throw new NotFoundException('Company not found');
    const previousKey = this.extractObjectKeyFromPublicUrl(company.logoUrl);

    await this.prisma.company.update({
      where: { id: companyId },
      data: { logoUrl: url },
    });

    await this.writeAudit(userId, input.kind, companyId, AUDIT_ACTIONS.ASSET_UPLOADED, {
      objectKey: input.objectKey,
      previousKey,
    });

    this.imageProcessor.enqueueProcess({
      kind: 'company-logo',
      objectKey: input.objectKey,
      mimeType: input.mimeType,
      entityId: companyId,
    });

    if (previousKey && previousKey !== input.objectKey) {
      void this.storage.delete({ visibility: 'public', objectKey: previousKey });
    }

    return {
      id: companyId,
      kind: input.kind,
      entityId: companyId,
      objectKey: input.objectKey,
      url,
      visibility: 'public',
    };
  }

  private async commitTrainerAvatar(
    userId: string,
    input: UploadCommitRequest,
    url: string,
  ): Promise<UploadCommitResponse> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    const previousKey = this.extractObjectKeyFromPublicUrl(user.avatarUrl);

    await this.prisma.user.update({ where: { id: userId }, data: { avatarUrl: url } });
    await this.writeAudit(userId, input.kind, userId, AUDIT_ACTIONS.ASSET_UPLOADED, {
      objectKey: input.objectKey,
      previousKey,
    });

    this.imageProcessor.enqueueProcess({
      kind: 'trainer-avatar',
      objectKey: input.objectKey,
      mimeType: input.mimeType,
      entityId: userId,
    });

    if (previousKey && previousKey !== input.objectKey) {
      void this.storage.delete({ visibility: 'public', objectKey: previousKey });
    }

    return {
      id: userId,
      kind: input.kind,
      entityId: userId,
      objectKey: input.objectKey,
      url,
      visibility: 'public',
    };
  }

  private async commitTrainerAsset(
    userId: string,
    profileId: string,
    input: UploadCommitRequest,
    url: string,
  ): Promise<UploadCommitResponse> {
    // TOCTOU-safe: upsert-by-unique-key so a double-submit with the same object
    // key does not create two rows. The unique index on TrainerAsset.objectKey
    // makes this a conditional insert.
    const created = await this.prisma.trainerAsset.upsert({
      where: { objectKey: input.objectKey },
      create: {
        profileId,
        kind: 'portfolio',
        objectKey: input.objectKey,
        url,
        title: input.title ?? null,
        mimeType: input.mimeType,
        byteLength: input.byteLength,
      },
      update: {
        // If the row already exists and was soft-deleted, un-delete it.
        deletedAt: null,
        title: input.title ?? undefined,
      },
    });

    await this.writeAudit(userId, input.kind, profileId, AUDIT_ACTIONS.ASSET_UPLOADED, {
      assetId: created.id,
      objectKey: input.objectKey,
    });

    if (input.mimeType.startsWith('image/')) {
      this.imageProcessor.enqueueProcess({
        kind: 'trainer-asset',
        objectKey: input.objectKey,
        mimeType: input.mimeType,
        entityId: profileId,
      });
    }

    return {
      id: created.id,
      kind: input.kind,
      entityId: profileId,
      objectKey: input.objectKey,
      url,
      visibility: 'public',
    };
  }

  private async commitApplicationAttachment(
    userId: string,
    applicationId: string,
    input: UploadCommitRequest,
  ): Promise<UploadCommitResponse> {
    const created = await this.prisma.applicationAttachment.upsert({
      where: { objectKey: input.objectKey },
      create: {
        applicationId,
        objectKey: input.objectKey,
        mimeType: input.mimeType,
        byteLength: input.byteLength,
        title: input.title ?? null,
      },
      update: {
        deletedAt: null,
        title: input.title ?? undefined,
      },
    });

    await this.writeAudit(userId, input.kind, applicationId, AUDIT_ACTIONS.ASSET_UPLOADED, {
      assetId: created.id,
      objectKey: input.objectKey,
    });

    this.scanner.enqueueScan({
      attachmentId: created.id,
      objectKey: input.objectKey,
      mimeType: input.mimeType,
    });

    return {
      id: created.id,
      kind: input.kind,
      entityId: applicationId,
      objectKey: input.objectKey,
      url: '',
      visibility: 'private',
      scanStatus: created.scanStatus as 'pending' | 'clean' | 'infected',
    };
  }

  // ---------------------------------------------------------------------------
  // Ownership + validation helpers
  // ---------------------------------------------------------------------------

  private assertMimeAndSize(kind: UploadKind, mimeType: string, byteLength: number): void {
    const quota = UPLOAD_QUOTAS[kind];
    if (!isAllowedMime(kind, mimeType)) {
      throw new BadRequestException(
        `MIME type ${mimeType} is not allowed for ${kind}. Allowed: ${quota.allowedMimes.join(', ')}`,
      );
    }
    if (byteLength <= 0 || byteLength > quota.maxFileSize) {
      throw new BadRequestException(
        `byteLength ${byteLength} exceeds ${quota.maxFileSize} limit for ${kind}`,
      );
    }
  }

  private async assertOwnership(
    userId: string,
    kind: UploadKind,
    entityId: string,
  ): Promise<OwnedEntity> {
    switch (kind) {
      case 'company-logo': {
        const c = await this.prisma.company.findUnique({ where: { id: entityId } });
        if (!c) throw new NotFoundException('Company not found');
        if (c.ownerId !== userId) throw new ForbiddenException('Not the owner of this company');
        return { entityId };
      }
      case 'trainer-avatar': {
        if (entityId !== userId) {
          throw new ForbiddenException('Avatar entityId must equal the current user id');
        }
        const u = await this.prisma.user.findUnique({ where: { id: userId } });
        if (!u) throw new NotFoundException('User not found');
        if (u.role !== 'TRAINER') {
          throw new ForbiddenException('Only trainers can upload an avatar');
        }
        return { entityId };
      }
      case 'trainer-asset': {
        // entityId = TrainerProfile.id
        const profile = await this.prisma.trainerProfile.findUnique({ where: { id: entityId } });
        if (!profile) throw new NotFoundException('Trainer profile not found');
        if (profile.userId !== userId) {
          throw new ForbiddenException('Not the owner of this profile');
        }
        return { entityId, profileId: profile.id };
      }
      case 'application-attachment': {
        const app = await this.prisma.application.findUnique({ where: { id: entityId } });
        if (!app) throw new NotFoundException('Application not found');
        if (app.trainerId !== userId) {
          throw new ForbiddenException('Only the trainer can attach files to this application');
        }
        return { entityId };
      }
      default:
        throw new BadRequestException('Unsupported upload kind');
    }
  }

  private async assertBelowMaxCount(kind: UploadKind, owned: OwnedEntity): Promise<void> {
    const quota = UPLOAD_QUOTAS[kind];
    if (quota.maxCount <= 1) return;
    const count =
      kind === 'trainer-asset'
        ? await this.prisma.trainerAsset.count({
            where: { profileId: owned.profileId!, deletedAt: null },
          })
        : kind === 'application-attachment'
          ? await this.prisma.applicationAttachment.count({
              where: { applicationId: owned.entityId, deletedAt: null },
            })
          : 0;
    if (count >= quota.maxCount) {
      throw new BadRequestException(
        `Maximum ${quota.maxCount} ${kind} entries reached; delete one before uploading more`,
      );
    }
  }

  private buildObjectKey(kind: UploadKind, owned: OwnedEntity, mimeType: string): string {
    const token = randomBytes(SIGNED_KEY_BYTES).toString('hex');
    const ext = mimeToExtension(mimeType);
    const prefix = this.keyPrefix(kind);
    const ownerId = kind === 'trainer-asset' ? owned.profileId! : owned.entityId;
    return `${prefix}/${ownerId}/${token}${ext}`;
  }

  private keyPrefix(kind: UploadKind): string {
    switch (kind) {
      case 'company-logo':
        return 'company-logos';
      case 'trainer-avatar':
        return 'trainer-avatars';
      case 'trainer-asset':
        return 'trainer-assets';
      case 'application-attachment':
        return 'application-attachments';
    }
  }

  /**
   * Defence in depth: the client may replay the presign response's objectKey
   * in commit, but it must still start with the server-chosen prefix for the
   * owner. Blocks a confused-deputy commit where a trainer tries to commit
   * another trainer's presigned key against their own entityId.
   */
  private assertObjectKeyBelongsTo(
    kind: UploadKind,
    owned: OwnedEntity,
    objectKey: string,
  ): void {
    const ownerId = kind === 'trainer-asset' ? owned.profileId! : owned.entityId;
    const expected = `${this.keyPrefix(kind)}/${ownerId}/`;
    if (!objectKey.startsWith(expected)) {
      throw new ForbiddenException('Object key does not belong to this entity');
    }
    if (objectKey.includes('..') || objectKey.includes('//')) {
      throw new BadRequestException('Invalid object key');
    }
  }

  private extractObjectKeyFromPublicUrl(url: string | null | undefined): string | null {
    if (!url) return null;
    const base = this.storage.publicUrlFor('');
    const prefix = base.replace(/\/+$/, '') + '/';
    return url.startsWith(prefix) ? url.slice(prefix.length) : null;
  }

  private async writeAudit(
    userId: string,
    kind: UploadKind,
    entityId: string,
    action: (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS],
    diff: Record<string, unknown>,
  ): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        actorId: userId,
        action,
        entityType: entityTypeFor(kind),
        entityId,
        diff: { ...diff, kind },
      },
    });
  }
}

function mimeToExtension(mime: string): string {
  const m = mime.toLowerCase();
  const table: Record<string, string> = {
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'image/webp': '.webp',
    'application/pdf': '.pdf',
    'application/zip': '.zip',
    'text/plain': '.txt',
  };
  return table[m] ?? '';
}

function entityTypeFor(kind: UploadKind): string {
  switch (kind) {
    case 'company-logo':
      return 'Company';
    case 'trainer-avatar':
      return 'User';
    case 'trainer-asset':
      return 'TrainerAsset';
    case 'application-attachment':
      return 'ApplicationAttachment';
  }
}
