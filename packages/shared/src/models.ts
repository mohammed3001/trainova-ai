import { z } from 'zod';

export const MODEL_PROVIDERS = [
  'OPENAI_COMPATIBLE',
  'ANTHROPIC',
  'BEDROCK',
  'HUGGINGFACE',
  'RAW_HTTPS',
] as const;
export type ModelProvider = (typeof MODEL_PROVIDERS)[number];

export const MODEL_AUTH_KINDS = [
  'api_key',
  'bearer',
  'aws_sigv4',
  'none',
] as const;
export type ModelAuthKind = (typeof MODEL_AUTH_KINDS)[number];

export const MODEL_CONNECTION_STATUSES = [
  'DRAFT',
  'ACTIVE',
  'DISABLED',
] as const;
export type ModelConnectionStatus = (typeof MODEL_CONNECTION_STATUSES)[number];

const httpsUrl = z
  .string()
  .url()
  .refine((u) => /^https:\/\//i.test(u), 'must be an https:// URL');

export const modelConnectionInputSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    provider: z.enum(MODEL_PROVIDERS),
    endpointUrl: httpsUrl.optional(),
    modelId: z.string().trim().max(120).optional(),
    region: z.string().trim().max(40).optional(),
    authKind: z.enum(MODEL_AUTH_KINDS).default('api_key'),
    /** Plain-text credential — server encrypts before persisting. */
    credentials: z.string().min(1).max(8192).optional(),
    metadata: z.record(z.unknown()).default({}),
  })
  .superRefine((value, ctx) => {
    // Provider-specific contracts. Keeping these declarative here so the
    // same rule is enforced on both the form and the API.
    switch (value.provider) {
      case 'OPENAI_COMPATIBLE':
      case 'RAW_HTTPS':
      case 'HUGGINGFACE':
        if (!value.endpointUrl) {
          ctx.addIssue({
            code: 'custom',
            path: ['endpointUrl'],
            message: 'endpointUrl is required for this provider',
          });
        }
        break;
      case 'BEDROCK':
        if (!value.region) {
          ctx.addIssue({
            code: 'custom',
            path: ['region'],
            message: 'region is required for Bedrock',
          });
        }
        break;
      default:
        break;
    }
    if (value.authKind === 'aws_sigv4' && value.provider !== 'BEDROCK') {
      ctx.addIssue({
        code: 'custom',
        path: ['authKind'],
        message: 'aws_sigv4 is only valid for Bedrock',
      });
    }
    if (
      value.authKind !== 'none' &&
      (value.credentials === undefined || value.credentials.length === 0)
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['credentials'],
        message: 'credentials are required unless authKind is "none"',
      });
    }
  });

export type ModelConnectionInput = z.infer<typeof modelConnectionInputSchema>;

export const modelConnectionUpdateSchema = modelConnectionInputSchema
  .innerType()
  .partial()
  .extend({
    /** Required to keep `superRefine` predictable on partial updates. */
    provider: z.enum(MODEL_PROVIDERS).optional(),
  });
export type ModelConnectionUpdate = z.infer<typeof modelConnectionUpdateSchema>;

/**
 * Public shape the API returns when listing or fetching a single
 * connection. Notice: `encryptedCredentials` is **never** included; we
 * only echo a short preview so the UI can confirm a key is on file.
 */
export interface PublicModelConnection {
  id: string;
  companyId: string;
  name: string;
  provider: ModelProvider;
  endpointUrl: string | null;
  modelId: string | null;
  region: string | null;
  authKind: ModelAuthKind;
  hasCredentials: boolean;
  credentialsPreview: string | null;
  metadata: Record<string, unknown>;
  status: ModelConnectionStatus;
  lastCheckedAt: string | null;
  lastCheckOk: boolean | null;
  lastCheckError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ModelConnectionTestResult {
  ok: boolean;
  latencyMs: number | null;
  detail?: string;
  error?: string;
}
