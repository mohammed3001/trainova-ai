import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { brandingSettingsSchema, type BrandingSettingsInput } from '@trainova/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { WhiteLabelService } from './white-label.service';

@ApiTags('white-label')
@Controller('company/branding')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('COMPANY_OWNER')
export class WhiteLabelController {
  constructor(private readonly whiteLabel: WhiteLabelService) {}

  @Get()
  get(@CurrentUser() user: AuthUser) {
    return this.whiteLabel.getForOwner(user.id);
  }

  @Put()
  @UsePipes(new ZodValidationPipe(brandingSettingsSchema))
  update(@CurrentUser() user: AuthUser, @Body() body: BrandingSettingsInput) {
    return this.whiteLabel.updateForOwner(user.id, body);
  }

  @Get('verification')
  verification(@CurrentUser() user: AuthUser) {
    return this.whiteLabel.getVerificationInstructionsForOwner(user.id);
  }

  // Marks DNS verification as complete after the OWNER has placed the TXT
  // record. The token in the path must match the server-computed value so a
  // logged-in OWNER cannot forge another tenant's verification.
  @Post('verification/:token')
  markVerified(@CurrentUser() user: AuthUser, @Param('token') token: string) {
    return this.whiteLabel.markVerifiedForOwner(user.id, token);
  }
}
