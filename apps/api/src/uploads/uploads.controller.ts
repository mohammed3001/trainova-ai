import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  UPLOAD_KINDS,
  uploadCommitRequestSchema,
  uploadPresignRequestSchema,
  type UploadCommitRequest,
  type UploadKind,
  type UploadPresignRequest,
} from '@trainova/shared';
import { z } from 'zod';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { UploadsService } from './uploads.service';

const uploadKindEnum = z.enum(UPLOAD_KINDS);

@ApiTags('uploads')
@Controller('uploads')
export class UploadsController {
  constructor(private readonly uploads: UploadsService) {}

  /**
   * Returns a short-lived presigned PUT URL the browser can use to upload a
   * file directly to object storage. Bytes never flow through the API.
   * Keyed on user id (see ThrottlerGuard subclass) so presign abuse can't be
   * IP-spoofed via X-Forwarded-For.
   */
  @Post('presign')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @UsePipes(new ZodValidationPipe(uploadPresignRequestSchema))
  presign(@CurrentUser() user: AuthUser, @Body() body: UploadPresignRequest) {
    return this.uploads.presign(user.id, body);
  }

  /**
   * After the browser has PUT the file to the presigned URL, it calls commit
   * so the server can verify the object exists at the expected size/MIME and
   * write the owning DB row (Company.logoUrl / TrainerAsset / ...).
   */
  @Post('commit')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @UsePipes(new ZodValidationPipe(uploadCommitRequestSchema))
  commit(@CurrentUser() user: AuthUser, @Body() body: UploadCommitRequest) {
    return this.uploads.commit(user.id, body);
  }

  /**
   * Soft-deletes the asset row and enqueues an async storage delete. For
   * singleton kinds (company-logo, trainer-avatar) the `:assetId` segment
   * must be `current`; for collection kinds it's the row id.
   */
  @Delete(':kind/:entityId/:assetId')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  delete(
    @CurrentUser() user: AuthUser,
    @Param('kind') kindParam: string,
    @Param('entityId') entityId: string,
    @Param('assetId') assetId: string,
  ) {
    const kind = uploadKindEnum.parse(kindParam) as UploadKind;
    return this.uploads.delete(user.id, kind, entityId, assetId);
  }

  /**
   * Returns a short-lived presigned GET URL for a private attachment after
   * re-checking ownership. Ownership is checked inside the service for every
   * call — we never cache this result.
   */
  @Get('attachments/:attachmentId/download')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  downloadAttachment(
    @CurrentUser() user: AuthUser,
    @Param('attachmentId') attachmentId: string,
  ) {
    return this.uploads.getAttachmentDownloadUrl(user.id, attachmentId);
  }
}
