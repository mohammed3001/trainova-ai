import { z } from 'zod';

export const MODEL_CALL_OPERATIONS = [
  'CHAT',
  'COMPLETE',
  'EMBED',
  'CUSTOM',
] as const;
export type ModelCallOperation = (typeof MODEL_CALL_OPERATIONS)[number];

export const workbenchMessageSchema = z.object({
  role: z.enum(['system', 'user', 'assistant']),
  content: z.string().min(1).max(64 * 1024),
});
export type WorkbenchMessage = z.infer<typeof workbenchMessageSchema>;

/**
 * Request the trainer sends to the platform's model proxy. The proxy
 * translates this shape into the vendor-specific request on the
 * server, so trainers never see the upstream URL or the raw auth
 * header for the company's model.
 */
export const workbenchCallInputSchema = z
  .object({
    operation: z.enum(MODEL_CALL_OPERATIONS).default('CHAT'),
    messages: z.array(workbenchMessageSchema).min(1).max(40).optional(),
    prompt: z.string().min(1).max(64 * 1024).optional(),
    input: z
      .union([z.string().max(64 * 1024), z.array(z.string().max(16 * 1024)).max(32)])
      .optional(),
    temperature: z.number().min(0).max(2).optional(),
    maxTokens: z.number().int().positive().max(8192).optional(),
    /** Free-form vendor passthrough, merged *after* proxy-owned keys. */
    extra: z.record(z.unknown()).optional(),
  })
  .superRefine((value, ctx) => {
    // The proxy has two entry-point shapes: chat-style (messages) and
    // completion-style (prompt). One of them is required per operation;
    // embeddings require `input`. Keeping this validation in the shared
    // schema so the trainer form surfaces the error locally before we
    // even make a round-trip.
    if (value.operation === 'CHAT') {
      if (!value.messages || value.messages.length === 0) {
        ctx.addIssue({
          code: 'custom',
          path: ['messages'],
          message: 'messages are required for chat operations',
        });
      }
    } else if (value.operation === 'COMPLETE') {
      if (!value.prompt && !value.messages) {
        ctx.addIssue({
          code: 'custom',
          path: ['prompt'],
          message: 'prompt or messages are required for completion',
        });
      }
    } else if (value.operation === 'EMBED') {
      if (value.input === undefined) {
        ctx.addIssue({
          code: 'custom',
          path: ['input'],
          message: 'input is required for embeddings',
        });
      }
    }
  });
export type WorkbenchCallInput = z.infer<typeof workbenchCallInputSchema>;

/**
 * What the proxy returns to the trainer. The vendor's full response is
 * persisted server-side as a `ModelCall`, but we only surface a
 * normalised slice here so the UI can stay provider-agnostic.
 */
export interface WorkbenchCallResult {
  id: string;
  createdAt: string;
  operation: ModelCallOperation;
  /** Assistant reply for CHAT / COMPLETE; joined embedding for EMBED. */
  outputText: string | null;
  /** Raw, provider-shaped response body for power users. */
  raw: unknown;
  status: number;
  latencyMs: number;
  tokensIn: number | null;
  tokensOut: number | null;
  costCents: number | null;
  errorMessage: string | null;
}

export interface PublicModelCall {
  id: string;
  connectionId: string;
  applicationId: string | null;
  jobRequestId: string | null;
  trainerId: string;
  operation: ModelCallOperation;
  responseStatus: number | null;
  latencyMs: number | null;
  tokensIn: number | null;
  tokensOut: number | null;
  costCents: number | null;
  errorMessage: string | null;
  createdAt: string;
  /** First ~120 chars of the user-visible prompt / input. */
  requestPreview: string;
  /** First ~160 chars of the normalised response. */
  responsePreview: string | null;
}
