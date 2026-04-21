import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SkillsService } from './skills.service';

@ApiTags('skills')
@Controller('skills')
export class SkillsController {
  constructor(private readonly skills: SkillsService) {}

  @Get()
  list() {
    return this.skills.list();
  }

  @Get(':slug')
  findBySlug(@Param('slug') slug: string) {
    return this.skills.findBySlug(slug);
  }
}
