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
  createSavedSearchSchema,
  updateSavedSearchSchema,
  type CreateSavedSearchInput,
  type UpdateSavedSearchInput,
} from '@trainova/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { SavedSearchesService } from './saved-searches.service';

@ApiTags('saved-searches')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('saved-searches')
export class SavedSearchesController {
  constructor(private readonly service: SavedSearchesService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.service.list(user.id);
  }

  @Post()
  @UsePipes(new ZodValidationPipe(createSavedSearchSchema))
  create(@CurrentUser() user: AuthUser, @Body() body: CreateSavedSearchInput) {
    return this.service.create(user.id, body);
  }

  @Patch(':id')
  @UsePipes(new ZodValidationPipe(updateSavedSearchSchema))
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: UpdateSavedSearchInput,
  ) {
    return this.service.update(user.id, id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    await this.service.remove(user.id, id);
  }

  @Get(':id/preview')
  preview(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.preview(user.id, id);
  }
}
