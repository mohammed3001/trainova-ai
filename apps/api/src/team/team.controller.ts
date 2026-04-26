import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  acceptInvitationSchema,
  createInvitationSchema,
  updateMemberRoleSchema,
  type AcceptInvitationInput,
  type CreateInvitationInput,
  type UpdateMemberRoleInput,
} from '@trainova/shared';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { TeamService } from './team.service';

@ApiTags('team')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('team')
export class TeamController {
  constructor(private readonly service: TeamService) {}

  @Get('me')
  getMyTeam(@CurrentUser() user: AuthUser) {
    return this.service.getTeamForCompany(user.id);
  }

  @Post('invitations')
  @UsePipes(new ZodValidationPipe(createInvitationSchema))
  invite(@CurrentUser() user: AuthUser, @Body() body: CreateInvitationInput) {
    return this.service.createInvitation(user.id, body);
  }

  @Post('invitations/:id/revoke')
  @HttpCode(200)
  revoke(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.revokeInvitation(user.id, id);
  }

  @Get('invitations/preview/:token')
  preview(@CurrentUser() user: AuthUser, @Param('token') token: string) {
    return this.service.previewInvitation(user.id, token);
  }

  @Post('invitations/accept')
  @HttpCode(200)
  @UsePipes(new ZodValidationPipe(acceptInvitationSchema))
  accept(@CurrentUser() user: AuthUser, @Body() body: AcceptInvitationInput) {
    return this.service.acceptInvitation(user.id, body.token);
  }

  @Patch('members/:id')
  @UsePipes(new ZodValidationPipe(updateMemberRoleSchema))
  updateRole(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: UpdateMemberRoleInput,
  ) {
    return this.service.updateMemberRole(user.id, id, body);
  }

  @Delete('members/:id')
  @HttpCode(204)
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.removeMember(user.id, id);
  }
}
