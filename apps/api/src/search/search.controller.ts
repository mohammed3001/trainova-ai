import { Controller, Get, Query, UsePipes } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { searchJobsQuerySchema, type SearchJobsQuery } from '@trainova/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { SearchService } from './search.service';

@ApiTags('search')
@Controller('search')
export class SearchController {
  constructor(private readonly service: SearchService) {}

  @Get('jobs')
  @UsePipes(new ZodValidationPipe(searchJobsQuerySchema))
  searchJobs(@Query() query: SearchJobsQuery) {
    return this.service.searchJobsHydrated(query);
  }
}
