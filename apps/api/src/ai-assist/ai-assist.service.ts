import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@trainova/db';
import {
  AI_ASSIST_FLAG_KEY,
  type AiAssistKind,
  type AiAssistRequestSummary,
  applicationScreenInputSchema,
  applicationScreenOutputSchema,
  type ApplicationScreenInput,
  type ApplicationScreenOutput,
  chatSummaryInputSchema,
  chatSummaryOutputSchema,
  type ChatSummaryInput,
  type ChatSummaryOutput,
  chatTasksInputSchema,
  chatTasksOutputSchema,
  type ChatTasksInput,
  type ChatTasksOutput,
  emailDraftInputSchema,
  emailDraftOutputSchema,
  type EmailDraftInput,
  type EmailDraftOutput,
  pricingSuggestInputSchema,
  pricingSuggestOutputSchema,
  type PricingSuggestInput,
  type PricingSuggestOutput,
  profileOptInputSchema,
  profileOptOutputSchema,
  type ProfileOptInput,
  type ProfileOptOutput,
  requestDraftInputSchema,
  requestDraftOutputSchema,
  type RequestDraftInput,
  type RequestDraftOutput,
  seoMetaInputSchema,
  seoMetaOutputSchema,
  type SeoMetaInput,
  type SeoMetaOutput,
  testGenInputSchema,
  testGenOutputSchema,
  type TestGenInput,
  type TestGenOutput,
} from '@trainova/shared';
import { z, type ZodTypeAny } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { FeatureFlagsService } from '../feature-flags/feature-flags.service';
import { callLlm, type ChatMessage } from './ai-provider';
import {
  buildApplicationScreenPrompt,
  buildChatSummaryPrompt,
  buildEmailDraftPrompt,
  buildPricingSuggestPrompt,
  buildProfileOptPrompt,
  buildRequestDraftPrompt,
  buildSeoMetaPrompt,
  buildTestGenPrompt,
} from './ai-prompts';

export interface AiAssistActor {
  userId: string;
  email: string;
  role: string;
  ip?: string | null;
}

interface BuiltPrompt {
  messages: ChatMessage[];
  contextEntityType?: string;
  contextEntityId?: string;
  allowedRoles?: string[];
  redactedInput?: Record<string, unknown>;
  /**
   * Server-known fields merged into the parsed JSON BEFORE output
   * validation. Use for things the LLM should not be trusted to produce
   * (e.g. message IDs, IDs derived from the request context).
   */
  injectIntoOutput?: Record<string, unknown>;
}

interface RunArgs<TIn, TOut> {
  kind: AiAssistKind;
  input: TIn;
  inputSchema: ZodTypeAny;
  outputSchema: ZodTypeAny;
  buildPrompt: () => Promise<BuiltPrompt>;
  /** Optional post-processor — e.g. clamp numeric fields, normalise. */
  postProcess?: (parsed: TOut) => TOut;
  maxTokens?: number;
  temperature?: number;
}

@Injectable()
export class AiAssistService {
  private readonly logger = new Logger(AiAssistService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly flags: FeatureFlagsService,
  ) {}

  // -----------------------------------------------------------------
  // Plan / feature-flag gate
  // -----------------------------------------------------------------

  /**
   * Plan gate. AI Assistant is a premium feature; we gate via the
   * `ai_assistant` feature flag (rollout, audience targeting). The flag
   * is created lazily by admins through the standard feature-flag
   * admin UI; until it exists we deny by default.
   *
   * Admin/super-admin always pass to support internal tooling.
   */
  private async assertEnabled(actor: AiAssistActor): Promise<void> {
    if (actor.role === 'SUPER_ADMIN' || actor.role === 'ADMIN') return;
    const evalResult = await this.flags.evaluate(AI_ASSIST_FLAG_KEY, {
      userId: actor.userId,
      email: actor.email,
      role: actor.role as 'SUPER_ADMIN' | 'ADMIN' | 'COMPANY_OWNER' | 'COMPANY_MEMBER' | 'TRAINER',
    });
    if (!evalResult.enabled) {
      throw new ForbiddenException(
        'AI Assistant is not enabled for your account. Upgrade your plan or contact support.',
      );
    }
  }

  // -----------------------------------------------------------------
  // Generic runner: persists, calls provider, validates, updates row
  // -----------------------------------------------------------------

  private async run<TIn, TOut>(actor: AiAssistActor, args: RunArgs<TIn, TOut>): Promise<{ id: string; output: TOut }> {
    await this.assertEnabled(actor);

    // Validate input defensively even if controller already did.
    const inputParsed = args.inputSchema.safeParse(args.input);
    if (!inputParsed.success) {
      throw new BadRequestException(`Invalid input for ${args.kind}: ${inputParsed.error.message}`);
    }

    const built = await args.buildPrompt();
    if (built.allowedRoles && !built.allowedRoles.includes(actor.role)) {
      throw new ForbiddenException(`Role ${actor.role} cannot run ${args.kind}`);
    }

    // Persist a PENDING row up-front so we have a record even if the
    // provider call crashes the process. We store a redacted copy of
    // the input when the prompt builder produced one (e.g. job IDs
    // expanded to fields, with PII removed).
    const recordedInput =
      built.redactedInput ?? (inputParsed.data as Record<string, unknown>);
    const row = await this.prisma.aiAssistRequest.create({
      data: {
        userId: actor.userId,
        kind: args.kind,
        status: 'PENDING',
        inputJson: recordedInput as Prisma.InputJsonValue,
        contextEntityType: built.contextEntityType ?? null,
        contextEntityId: built.contextEntityId ?? null,
        ip: actor.ip ?? null,
      },
      select: { id: true },
    });

    let llm;
    try {
      llm = await callLlm({
        messages: built.messages,
        temperature: args.temperature ?? 0.2,
        maxTokens: args.maxTokens ?? 1500,
        jsonMode: true,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.prisma.aiAssistRequest.update({
        where: { id: row.id },
        data: { status: 'FAILED', error: message.slice(0, 4000) },
      });
      this.logger.warn(`AiAssist ${args.kind} provider failure: ${message}`);
      throw new InternalServerErrorException(`AI provider failure: ${message}`);
    }

    let parsed: TOut;
    try {
      const rawJson = JSON.parse(llm.text);
      const json =
        typeof rawJson === 'object' && rawJson !== null && built.injectIntoOutput
          ? { ...rawJson, ...built.injectIntoOutput }
          : rawJson;
      const result = args.outputSchema.safeParse(json);
      if (!result.success) {
        throw new Error(`Output schema mismatch: ${result.error.message}`);
      }
      parsed = result.data as TOut;
      if (args.postProcess) parsed = args.postProcess(parsed);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.prisma.aiAssistRequest.update({
        where: { id: row.id },
        data: {
          status: 'FAILED',
          error: message.slice(0, 4000),
          modelUsed: llm.modelUsed,
          provider: llm.provider,
          promptTokens: llm.promptTokens,
          completionTokens: llm.completionTokens,
          costMicros: llm.costMicros,
          durationMs: llm.durationMs,
          outputJson: { rawText: llm.text } as Prisma.InputJsonValue,
        },
      });
      // Mock provider returns an `_mock` object instead of the real
      // shape. We surface a clean 200 with a placeholder so dev/CI
      // doesn't fail loudly while teaching the LLM to obey the schema.
      if (llm.provider === 'mock') {
        return { id: row.id, output: this.mockFallbackOutput(args.kind) as TOut };
      }
      this.logger.warn(`AiAssist ${args.kind} parse failure: ${message}`);
      throw new InternalServerErrorException(`AI output parse failure: ${message}`);
    }

    await this.prisma.aiAssistRequest.update({
      where: { id: row.id },
      data: {
        status: 'SUCCEEDED',
        modelUsed: llm.modelUsed,
        provider: llm.provider,
        promptTokens: llm.promptTokens,
        completionTokens: llm.completionTokens,
        costMicros: llm.costMicros,
        durationMs: llm.durationMs,
        outputJson: parsed as unknown as Prisma.InputJsonValue,
      },
    });
    return { id: row.id, output: parsed };
  }

  /**
   * Stable, schema-conforming placeholder used only in the mock-provider
   * code path so dev/CI can render a UI even without a real key. Real
   * providers never hit this branch.
   */
  private mockFallbackOutput(kind: AiAssistKind): unknown {
    switch (kind) {
      case 'REQUEST_DRAFT':
        return {
          title: '[mock] Trainer for AI fine-tuning project',
          description:
            '[mock] This is a placeholder draft generated when no AI provider key is configured. Replace OPENAI_API_KEY in your environment to get real suggestions tailored to your brief.',
          skills: ['fine-tuning', 'rlhf', 'evaluation'],
          budgetUsdMin: 2000,
          budgetUsdMax: 8000,
          conditions: ['NDA required', '3+ years experience'],
          durationDays: 30,
        };
      case 'APPLICATION_SCREEN':
        return {
          fitScore: 50,
          summary:
            '[mock] Placeholder screening output — configure OPENAI_API_KEY for real assessments.',
          strengths: ['stub'],
          risks: ['stub'],
          recommendation: 'TEST',
        };
      case 'CHAT_SUMMARY':
        return {
          summary: '[mock] Conversation summary placeholder.',
          keyPoints: ['stub'],
          language: 'en',
          upToMessageId: 'stub',
        };
      case 'CHAT_TASKS':
        return { tasks: [], upToMessageId: 'stub' };
      case 'SEO_META':
        return {
          metaTitle: '[mock] SEO title placeholder',
          metaDescription:
            '[mock] SEO description placeholder. Configure an AI provider for real suggestions.',
          keywords: ['stub'],
          slug: 'mock-placeholder',
        };
      case 'EMAIL_DRAFT':
        return {
          subject: '[mock] Subject placeholder',
          preheader: '[mock] Preheader placeholder',
          bodyHtml: '<p>[mock] Email body placeholder.</p>',
          bodyText: '[mock] Email body placeholder.',
        };
      case 'PRICING_SUGGEST':
        return {
          currency: 'USD',
          minCents: 200_000,
          maxCents: 800_000,
          pointCents: 450_000,
          rationale:
            '[mock] Pricing rationale placeholder — configure an AI provider key for real suggestions.',
        };
      case 'TEST_GEN':
        return {
          tasks: [
            {
              title: '[mock] Sample task',
              prompt:
                '[mock] Configure an AI provider to generate real practical tasks for this job.',
              rubric: '[mock] Stub rubric.',
              expectedSeconds: 600,
              kind: 'TEXT',
            },
          ],
        };
      case 'PROFILE_OPT':
        return {
          headline: '[mock] Profile headline placeholder',
          bio: '[mock] Bio placeholder — configure an AI provider for tailored copy that matches your portfolio.',
          suggestedSkills: ['stub'],
          tips: ['Add a measurable result to your bio'],
        };
      default:
        return {};
    }
  }

  // -----------------------------------------------------------------
  // Public methods (one per kind)
  // -----------------------------------------------------------------

  async draftRequest(actor: AiAssistActor, input: RequestDraftInput) {
    return this.run<RequestDraftInput, RequestDraftOutput>(actor, {
      kind: 'REQUEST_DRAFT',
      input,
      inputSchema: requestDraftInputSchema,
      outputSchema: requestDraftOutputSchema,
      buildPrompt: async () => ({
        messages: buildRequestDraftPrompt(input),
        allowedRoles: ['COMPANY_OWNER', 'COMPANY_MEMBER', 'ADMIN', 'SUPER_ADMIN'],
      }),
      postProcess: (out) => {
        // Cap min ≤ max, both ≥ 0.
        if (out.budgetUsdMin != null && out.budgetUsdMax != null && out.budgetUsdMin > out.budgetUsdMax) {
          const a = out.budgetUsdMin;
          out.budgetUsdMin = out.budgetUsdMax;
          out.budgetUsdMax = a;
        }
        return out;
      },
    });
  }

  async screenApplication(actor: AiAssistActor, input: ApplicationScreenInput) {
    return this.run<ApplicationScreenInput, ApplicationScreenOutput>(actor, {
      kind: 'APPLICATION_SCREEN',
      input,
      inputSchema: applicationScreenInputSchema,
      outputSchema: applicationScreenOutputSchema,
      buildPrompt: async () => {
        const app = await this.prisma.application.findUnique({
          where: { id: input.applicationId },
          select: {
            id: true,
            coverLetter: true,
            request: {
              select: {
                id: true,
                title: true,
                description: true,
                companyId: true,
                skills: { select: { skill: { select: { slug: true, nameEn: true } } } },
                company: { select: { ownerId: true, members: { select: { userId: true } } } },
              },
            },
            trainer: {
              select: {
                id: true,
                name: true,
                trainerProfile: {
                  select: {
                    headline: true,
                    bio: true,
                    skills: {
                      select: {
                        yearsExperience: true,
                        skill: { select: { slug: true } },
                      },
                    },
                  },
                },
              },
            },
          },
        });
        if (!app) throw new NotFoundException('Application not found');
        // Authorization: only the request's company members + admins.
        const isOwner = actor.userId === app.request.company.ownerId;
        const isMember = app.request.company.members.some((m) => m.userId === actor.userId);
        if (actor.role !== 'SUPER_ADMIN' && actor.role !== 'ADMIN' && !isOwner && !isMember) {
          throw new ForbiddenException('You are not part of the owning company');
        }
        const profile = app.trainer.trainerProfile;
        const yearsTotal = profile?.skills.reduce(
          (max, ts) => (ts.yearsExperience && ts.yearsExperience > max ? ts.yearsExperience : max),
          0,
        ) ?? 0;
        return {
          messages: buildApplicationScreenPrompt({
            jobTitle: app.request.title,
            jobDescription: app.request.description ?? '',
            jobSkills: app.request.skills.map((s) => s.skill.slug),
            applicantHeadline: profile?.headline ?? '',
            applicantBio: profile?.bio ?? '',
            applicantSkills: profile?.skills?.map((s) => s.skill.slug) ?? [],
            applicantYearsExperience: yearsTotal || null,
            coverLetter: app.coverLetter ?? '',
          }),
          contextEntityType: 'Application',
          contextEntityId: app.id,
          redactedInput: { applicationId: app.id, jobRequestId: app.request.id },
        };
      },
    });
  }

  async summarizeChat(actor: AiAssistActor, input: ChatSummaryInput) {
    return this.run<ChatSummaryInput, ChatSummaryOutput>(actor, {
      kind: 'CHAT_SUMMARY',
      input,
      inputSchema: chatSummaryInputSchema,
      outputSchema: chatSummaryOutputSchema,
      buildPrompt: async () => {
        const { transcript, upToMessageId } = await this.loadConversationOrThrow(actor, input);
        return {
          messages: buildChatSummaryPrompt({ messages: transcript, goal: 'summary' }),
          contextEntityType: 'Conversation',
          contextEntityId: input.conversationId,
          // Server-known: which message we summarised up to. The LLM
          // can't be trusted to echo IDs faithfully, so we inject.
          injectIntoOutput: { upToMessageId },
        };
      },
      postProcess: (out) => out,
    });
  }

  async extractTasks(actor: AiAssistActor, input: ChatTasksInput) {
    return this.run<ChatTasksInput, ChatTasksOutput>(actor, {
      kind: 'CHAT_TASKS',
      input,
      inputSchema: chatTasksInputSchema,
      outputSchema: chatTasksOutputSchema,
      buildPrompt: async () => {
        const { transcript, upToMessageId } = await this.loadConversationOrThrow(actor, input);
        return {
          messages: buildChatSummaryPrompt({ messages: transcript, goal: 'tasks' }),
          contextEntityType: 'Conversation',
          contextEntityId: input.conversationId,
          injectIntoOutput: { upToMessageId },
        };
      },
    });
  }

  private async loadConversationOrThrow(
    actor: AiAssistActor,
    input: ChatSummaryInput,
  ): Promise<{ transcript: Array<{ author: string; text: string }>; upToMessageId: string }> {
    const conv = await this.prisma.conversation.findUnique({
      where: { id: input.conversationId },
      select: {
        id: true,
        participants: { select: { userId: true } },
        messages: {
          where: { redactedAt: null },
          orderBy: { createdAt: 'asc' },
          take: input.maxMessages,
          select: {
            id: true,
            body: true,
            sender: { select: { id: true, name: true, role: true } },
            createdAt: true,
          },
        },
      },
    });
    if (!conv) throw new NotFoundException('Conversation not found');
    const isParticipant = conv.participants.some((p) => p.userId === actor.userId);
    if (actor.role !== 'SUPER_ADMIN' && actor.role !== 'ADMIN' && !isParticipant) {
      throw new ForbiddenException('You are not a participant of this conversation');
    }
    if (!conv.messages.length) {
      throw new BadRequestException('Conversation has no readable messages to summarise');
    }
    return {
      transcript: conv.messages.map((m) => ({
        author: `${m.sender.name} (${m.sender.role})`,
        text: m.body,
      })),
      upToMessageId: conv.messages[conv.messages.length - 1]!.id,
    };
  }

  async generateSeoMeta(actor: AiAssistActor, input: SeoMetaInput) {
    return this.run<SeoMetaInput, SeoMetaOutput>(actor, {
      kind: 'SEO_META',
      input,
      inputSchema: seoMetaInputSchema,
      outputSchema: seoMetaOutputSchema,
      buildPrompt: async () => ({
        messages: buildSeoMetaPrompt(input),
        allowedRoles: ['SUPER_ADMIN', 'ADMIN', 'COMPANY_OWNER', 'COMPANY_MEMBER', 'TRAINER'],
      }),
    });
  }

  async draftEmail(actor: AiAssistActor, input: EmailDraftInput) {
    return this.run<EmailDraftInput, EmailDraftOutput>(actor, {
      kind: 'EMAIL_DRAFT',
      input,
      inputSchema: emailDraftInputSchema,
      outputSchema: emailDraftOutputSchema,
      buildPrompt: async () => ({
        messages: buildEmailDraftPrompt(input),
        allowedRoles: ['SUPER_ADMIN', 'ADMIN'],
      }),
    });
  }

  async suggestPricing(actor: AiAssistActor, input: PricingSuggestInput) {
    return this.run<PricingSuggestInput, PricingSuggestOutput>(actor, {
      kind: 'PRICING_SUGGEST',
      input,
      inputSchema: pricingSuggestInputSchema,
      outputSchema: pricingSuggestOutputSchema,
      buildPrompt: async () => {
        const job = await this.prisma.jobRequest.findUnique({
          where: { id: input.jobRequestId },
          select: {
            id: true,
            title: true,
            description: true,
            currency: true,
            durationDays: true,
            skills: { select: { skill: { select: { slug: true } } } },
            company: { select: { ownerId: true, members: { select: { userId: true } } } },
          },
        });
        if (!job) throw new NotFoundException('Job request not found');
        const isOwner = actor.userId === job.company.ownerId;
        const isMember = job.company.members.some((m) => m.userId === actor.userId);
        if (actor.role !== 'SUPER_ADMIN' && actor.role !== 'ADMIN' && !isOwner && !isMember) {
          throw new ForbiddenException('You are not part of the owning company');
        }
        const skillSlugs = job.skills.map((s) => s.skill.slug);
        // Compute platform comparable median over similar contracts.
        // Contract has no direct relation to JobRequest; we join via Application.
        let comparableMedianCents: number | null = null;
        let comparableCount = 0;
        if (skillSlugs.length) {
          const rows = await this.prisma.contract.findMany({
            where: {
              status: { in: ['ACTIVE', 'COMPLETED'] },
              currency: job.currency ?? 'USD',
              application: {
                request: {
                  skills: { some: { skill: { slug: { in: skillSlugs } } } },
                },
              },
            },
            select: { totalAmountCents: true },
            take: 100,
          });
          if (rows.length) {
            const sorted = rows.map((r) => r.totalAmountCents).sort((a, b) => a - b);
            comparableCount = sorted.length;
            const mid = Math.floor(sorted.length / 2);
            const midVal = sorted[mid] ?? 0;
            const prevVal = sorted[mid - 1] ?? midVal;
            comparableMedianCents = sorted.length % 2 === 0 ? Math.round((prevVal + midVal) / 2) : midVal;
          }
        }
        return {
          messages: buildPricingSuggestPrompt({
            jobTitle: job.title,
            jobDescription: job.description ?? '',
            jobSkills: skillSlugs,
            jobDurationDays: job.durationDays,
            comparableContractsCount: comparableCount,
            comparableMedianCents,
            currency: job.currency ?? 'USD',
          }),
          contextEntityType: 'JobRequest',
          contextEntityId: job.id,
          redactedInput: { jobRequestId: job.id },
        };
      },
      postProcess: (out) => {
        // Clamp ordering: min ≤ point ≤ max.
        if (out.minCents > out.maxCents) {
          const a = out.minCents;
          out.minCents = out.maxCents;
          out.maxCents = a;
        }
        if (out.pointCents < out.minCents) out.pointCents = out.minCents;
        if (out.pointCents > out.maxCents) out.pointCents = out.maxCents;
        return out;
      },
    });
  }

  async generateTest(actor: AiAssistActor, input: TestGenInput) {
    return this.run<TestGenInput, TestGenOutput>(actor, {
      kind: 'TEST_GEN',
      input,
      inputSchema: testGenInputSchema,
      outputSchema: testGenOutputSchema,
      buildPrompt: async () => {
        const job = await this.prisma.jobRequest.findUnique({
          where: { id: input.jobRequestId },
          select: {
            id: true,
            title: true,
            description: true,
            skills: { select: { skill: { select: { slug: true } } } },
            company: { select: { ownerId: true, members: { select: { userId: true } } } },
          },
        });
        if (!job) throw new NotFoundException('Job request not found');
        const isOwner = actor.userId === job.company.ownerId;
        const isMember = job.company.members.some((m) => m.userId === actor.userId);
        if (actor.role !== 'SUPER_ADMIN' && actor.role !== 'ADMIN' && !isOwner && !isMember) {
          throw new ForbiddenException('You are not part of the owning company');
        }
        return {
          messages: buildTestGenPrompt({
            jobTitle: job.title,
            jobDescription: job.description ?? '',
            jobSkills: job.skills.map((s) => s.skill.slug),
            taskCount: input.taskCount,
          }),
          contextEntityType: 'JobRequest',
          contextEntityId: job.id,
          redactedInput: { jobRequestId: job.id, taskCount: input.taskCount },
        };
      },
    });
  }

  async optimizeProfile(actor: AiAssistActor, input: ProfileOptInput) {
    return this.run<ProfileOptInput, ProfileOptOutput>(actor, {
      kind: 'PROFILE_OPT',
      input,
      inputSchema: profileOptInputSchema,
      outputSchema: profileOptOutputSchema,
      buildPrompt: async () => {
        const profile = await this.prisma.trainerProfile.findUnique({
          where: { id: input.trainerProfileId },
          select: {
            id: true,
            userId: true,
            headline: true,
            bio: true,
            languages: true,
            user: { select: { locale: true } },
            skills: {
              select: {
                yearsExperience: true,
                skill: { select: { slug: true } },
              },
            },
          },
        });
        if (!profile) throw new NotFoundException('Trainer profile not found');
        if (actor.role !== 'SUPER_ADMIN' && actor.role !== 'ADMIN' && profile.userId !== actor.userId) {
          throw new ForbiddenException('You can only optimise your own profile');
        }
        const yearsExperience =
          profile.skills.reduce(
            (max, ts) => (ts.yearsExperience && ts.yearsExperience > max ? ts.yearsExperience : max),
            0,
          ) || null;
        return {
          messages: buildProfileOptPrompt({
            currentHeadline: profile.headline ?? '',
            currentBio: profile.bio ?? '',
            currentSkills: profile.skills.map((s) => s.skill.slug),
            yearsExperience,
            industries: profile.languages,
            locale: profile.user.locale,
          }),
          contextEntityType: 'TrainerProfile',
          contextEntityId: profile.id,
          redactedInput: { trainerProfileId: profile.id },
        };
      },
    });
  }

  // -----------------------------------------------------------------
  // History / detail
  // -----------------------------------------------------------------

  async listForUser(actor: AiAssistActor, kind: AiAssistKind | undefined, limit: number): Promise<AiAssistRequestSummary[]> {
    const rows = await this.prisma.aiAssistRequest.findMany({
      where: { userId: actor.userId, ...(kind ? { kind } : {}) },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        kind: true,
        status: true,
        createdAt: true,
        modelUsed: true,
        provider: true,
        contextEntityType: true,
        contextEntityId: true,
        promptTokens: true,
        completionTokens: true,
        costMicros: true,
        durationMs: true,
        error: true,
      },
    });
    return rows.map((r) => ({
      id: r.id,
      kind: r.kind as AiAssistKind,
      status: r.status,
      createdAt: r.createdAt.toISOString(),
      modelUsed: r.modelUsed,
      provider: r.provider,
      contextEntityType: r.contextEntityType,
      contextEntityId: r.contextEntityId,
      promptTokens: r.promptTokens,
      completionTokens: r.completionTokens,
      costMicros: r.costMicros,
      durationMs: r.durationMs,
      error: r.error,
    }));
  }

  async getDetail(actor: AiAssistActor, id: string): Promise<AiAssistRequestSummary> {
    const row = await this.prisma.aiAssistRequest.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        kind: true,
        status: true,
        createdAt: true,
        modelUsed: true,
        provider: true,
        contextEntityType: true,
        contextEntityId: true,
        promptTokens: true,
        completionTokens: true,
        costMicros: true,
        durationMs: true,
        error: true,
        outputJson: true,
      },
    });
    if (!row) throw new NotFoundException('AI request not found');
    if (row.userId !== actor.userId && actor.role !== 'SUPER_ADMIN' && actor.role !== 'ADMIN') {
      throw new ForbiddenException('Not your AI request');
    }
    return {
      id: row.id,
      kind: row.kind as AiAssistKind,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
      modelUsed: row.modelUsed,
      provider: row.provider,
      contextEntityType: row.contextEntityType,
      contextEntityId: row.contextEntityId,
      promptTokens: row.promptTokens,
      completionTokens: row.completionTokens,
      costMicros: row.costMicros,
      durationMs: row.durationMs,
      error: row.error,
      output: row.outputJson,
    };
  }
}

// re-exported for tests
export { z };
