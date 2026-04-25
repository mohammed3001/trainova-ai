import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { updatePreferencesSchema, type UpdatePreferencesInput } from '@trainova/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { UsersService } from './users.service';

@ApiTags('users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.users.findById(user.id);
  }

  @Get('me/preferences')
  getPreferences(@CurrentUser() user: AuthUser) {
    return this.users.getPreferences(user.id);
  }

  @Patch('me/preferences')
  updatePreferences(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(updatePreferencesSchema))
    input: UpdatePreferencesInput,
  ) {
    return this.users.updatePreferences(user.id, input);
  }
}
