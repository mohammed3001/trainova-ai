import { BadRequestException, Controller, Get, Param, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { cmsLocaleSchema } from '@trainova/shared';
import { CmsService } from './cms.service';

function parseLocale(raw: string | undefined): 'en' | 'ar' {
  const result = cmsLocaleSchema.safeParse(raw ?? 'en');
  if (!result.success) throw new BadRequestException('Unsupported locale');
  return result.data;
}

@ApiTags('cms')
@Controller('public/cms')
export class PublicCmsController {
  constructor(private readonly cms: CmsService) {}

  @Get('articles')
  articles(
    @Query('locale') locale: string | undefined,
    @Query('cursor') cursor: string | undefined,
    @Query('limit') limitQ: string | undefined,
  ) {
    const limit = limitQ ? Number.parseInt(limitQ, 10) : undefined;
    return this.cms.publicArticles(parseLocale(locale), cursor, limit);
  }

  @Get('articles/:slug')
  article(@Param('slug') slug: string, @Query('locale') locale: string | undefined) {
    return this.cms.publicArticleBySlug(slug, parseLocale(locale));
  }

  @Get('faq')
  faq(@Query('locale') locale: string | undefined) {
    return this.cms.publicFaq(parseLocale(locale));
  }

  @Get('categories')
  categories() {
    return this.cms.publicCategories();
  }
}
