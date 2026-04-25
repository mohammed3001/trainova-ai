import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import {
  aiAssistListQuerySchema,
  applicationScreenInputSchema,
  chatSummaryInputSchema,
  chatTasksInputSchema,
  emailDraftInputSchema,
  pricingSuggestInputSchema,
  profileOptInputSchema,
  requestDraftInputSchema,
  seoMetaInputSchema,
  testGenInputSchema,
  type AiAssistListQuery,
  type ApplicationScreenInput,
  type ChatSummaryInput,
  type ChatTasksInput,
  type EmailDraftInput,
  type PricingSuggestInput,
  type ProfileOptInput,
  type RequestDraftInput,
  type SeoMetaInput,
  type TestGenInput,
} from '@trainova/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { clientIp } from '../common/client-ip.util';
import { AiAssistService, type AiAssistActor } from './ai-assist.service';
import { describeProvider } from './ai-provider';

function actorOf(user: AuthUser, req: Request): AiAssistActor {
  return {
    userId: user.id,
    email: user.email,
    role: user.role,
    ip: clientIp(req),
  };
}

@ApiTags('ai-assist')
@Controller('ai-assist')
export class AiAssistController {
  constructor(private readonly service: AiAssistService) {}

  @Get('health')
  health() {
    return describeProvider();
  }

  @Get('requests')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  list(@CurrentUser() user: AuthUser, @Req() req: Request, @Query() rawQuery: Record<string, unknown>) {
    const query = aiAssistListQuerySchema.parse(rawQuery) as AiAssistListQuery;
    return this.service.listForUser(actorOf(user, req), query.kind, query.limit);
  }

  @Get('requests/:id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  detail(@CurrentUser() user: AuthUser, @Req() req: Request, @Param('id') id: string) {
    return this.service.getDetail(actorOf(user, req), id);
  }

  @Post('request-draft')
  @HttpCode(200)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @UsePipes(new ZodValidationPipe(requestDraftInputSchema))
  draftRequest(@CurrentUser() user: AuthUser, @Req() req: Request, @Body() body: RequestDraftInput) {
    return this.service.draftRequest(actorOf(user, req), body);
  }

  @Post('screen-application')
  @HttpCode(200)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @UsePipes(new ZodValidationPipe(applicationScreenInputSchema))
  screen(@CurrentUser() user: AuthUser, @Req() req: Request, @Body() body: ApplicationScreenInput) {
    return this.service.screenApplication(actorOf(user, req), body);
  }

  @Post('chat-summary')
  @HttpCode(200)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @UsePipes(new ZodValidationPipe(chatSummaryInputSchema))
  chatSummary(@CurrentUser() user: AuthUser, @Req() req: Request, @Body() body: ChatSummaryInput) {
    return this.service.summarizeChat(actorOf(user, req), body);
  }

  @Post('chat-tasks')
  @HttpCode(200)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @UsePipes(new ZodValidationPipe(chatTasksInputSchema))
  chatTasks(@CurrentUser() user: AuthUser, @Req() req: Request, @Body() body: ChatTasksInput) {
    return this.service.extractTasks(actorOf(user, req), body);
  }

  @Post('seo-meta')
  @HttpCode(200)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @UsePipes(new ZodValidationPipe(seoMetaInputSchema))
  seoMeta(@CurrentUser() user: AuthUser, @Req() req: Request, @Body() body: SeoMetaInput) {
    return this.service.generateSeoMeta(actorOf(user, req), body);
  }

  @Post('email-draft')
  @HttpCode(200)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @UsePipes(new ZodValidationPipe(emailDraftInputSchema))
  emailDraft(@CurrentUser() user: AuthUser, @Req() req: Request, @Body() body: EmailDraftInput) {
    return this.service.draftEmail(actorOf(user, req), body);
  }

  @Post('pricing-suggest')
  @HttpCode(200)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @UsePipes(new ZodValidationPipe(pricingSuggestInputSchema))
  pricingSuggest(@CurrentUser() user: AuthUser, @Req() req: Request, @Body() body: PricingSuggestInput) {
    return this.service.suggestPricing(actorOf(user, req), body);
  }

  @Post('test-gen')
  @HttpCode(200)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @UsePipes(new ZodValidationPipe(testGenInputSchema))
  testGen(@CurrentUser() user: AuthUser, @Req() req: Request, @Body() body: TestGenInput) {
    return this.service.generateTest(actorOf(user, req), body);
  }

  @Post('profile-optimize')
  @HttpCode(200)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @UsePipes(new ZodValidationPipe(profileOptInputSchema))
  profileOpt(@CurrentUser() user: AuthUser, @Req() req: Request, @Body() body: ProfileOptInput) {
    return this.service.optimizeProfile(actorOf(user, req), body);
  }
}
