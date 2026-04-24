import { SignatureV4 } from '@smithy/signature-v4';
import { HttpRequest } from '@smithy/protocol-http';
import { Sha256 } from '@aws-crypto/sha256-js';
import type {
  ModelProvider,
  ModelCallOperation,
  WorkbenchCallInput,
  WorkbenchMessage,
} from '@trainova/shared';

/**
 * Vendor-agnostic proxy adapter. The service layer decrypts the company's
 * credential, hands it to `invokeModel`, and receives a normalised
 * `ProxyCallResult` — the shape the trainer's Workbench renders and the
 * `ModelCall` row persists. Keeping all vendor branching here so the
 * service / controller / logger stay provider-agnostic.
 */

export interface ProxyInvokeInput {
  provider: ModelProvider;
  endpointUrl: string | null;
  modelId: string | null;
  region: string | null;
  authKind: 'api_key' | 'bearer' | 'aws_sigv4' | 'none';
  credentials: string;
  call: WorkbenchCallInput;
}

export interface ProxyCallResult {
  status: number;
  latencyMs: number;
  /** Normalised assistant text (CHAT / COMPLETE) or joined embeddings (EMBED). */
  outputText: string | null;
  /** Provider-shaped response body — kept as-is for power users. */
  raw: unknown;
  tokensIn: number | null;
  tokensOut: number | null;
  errorMessage: string | null;
}

const PROXY_TIMEOUT_MS = 60_000;

export async function invokeModel(input: ProxyInvokeInput): Promise<ProxyCallResult> {
  const start = Date.now();
  try {
    switch (input.provider) {
      case 'OPENAI_COMPATIBLE':
        return await invokeOpenAiCompatible(input, start);
      case 'ANTHROPIC':
        return await invokeAnthropic(input, start);
      case 'HUGGINGFACE':
        return await invokeHuggingFace(input, start);
      case 'RAW_HTTPS':
        return await invokeRawHttps(input, start);
      case 'BEDROCK':
        return await invokeBedrock(input, start);
      default:
        return fail(start, `unsupported provider: ${input.provider}`);
    }
  } catch (e) {
    return fail(start, errorMessage(e));
  }
}

// --------------------------------------------------------------------------
// OpenAI-compatible (OpenAI, Azure OpenAI self-host, together.ai, LM Studio…)
// --------------------------------------------------------------------------

async function invokeOpenAiCompatible(
  input: ProxyInvokeInput,
  start: number,
): Promise<ProxyCallResult> {
  if (!input.endpointUrl) return fail(start, 'endpointUrl is required');

  const path = pathForOperation(input.call.operation);
  const url = new URL(path, endsWithSlash(input.endpointUrl)).toString();
  const body = buildOpenAiBody(input);

  const res = await fetchWithTimeout(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...bearerHeader(input),
    },
    body: JSON.stringify(body),
  });
  const json = await parseJsonSafe(res);
  const latencyMs = Date.now() - start;

  if (!res.ok) {
    return {
      status: res.status,
      latencyMs,
      outputText: null,
      raw: json,
      tokensIn: null,
      tokensOut: null,
      errorMessage: `upstream ${res.status}`,
    };
  }

  const outputText = extractOpenAiOutput(input.call.operation, json);
  const usage = (json && (json as Record<string, unknown>).usage) as
    | { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }
    | undefined;

  return {
    status: res.status,
    latencyMs,
    outputText,
    raw: json,
    tokensIn: usage?.prompt_tokens ?? null,
    tokensOut: usage?.completion_tokens ?? null,
    errorMessage: null,
  };
}

function pathForOperation(op: ModelCallOperation): string {
  switch (op) {
    case 'CHAT':
      return 'chat/completions';
    case 'COMPLETE':
      return 'completions';
    case 'EMBED':
      return 'embeddings';
    case 'CUSTOM':
      return 'chat/completions';
  }
}

function buildOpenAiBody(input: ProxyInvokeInput): Record<string, unknown> {
  const base: Record<string, unknown> = {
    model: input.modelId || 'gpt-4o-mini',
  };
  if (input.call.operation === 'CHAT' || input.call.operation === 'CUSTOM') {
    base.messages = input.call.messages ?? [];
  } else if (input.call.operation === 'COMPLETE') {
    base.prompt = input.call.prompt ?? messagesToPrompt(input.call.messages);
  } else if (input.call.operation === 'EMBED') {
    base.input = input.call.input;
  }
  if (input.call.operation !== 'EMBED') {
    if (input.call.temperature != null) base.temperature = input.call.temperature;
    if (input.call.maxTokens != null) base.max_tokens = input.call.maxTokens;
  }
  // Spread `base` AFTER `extra` so proxy-controlled fields (model, messages,
  // temperature, max_tokens, …) always win over trainer-supplied values. The
  // denylist is a defense in depth for fields we also set in `base`; for
  // fields we don't set (e.g. `top_p`, `stop`, `logit_bias`) trainers can
  // still customise via `extra`.
  return { ...safeExtra(input.call.extra, OPENAI_PROTECTED), ...base };
}

function extractOpenAiOutput(op: ModelCallOperation, json: unknown): string | null {
  if (!json || typeof json !== 'object') return null;
  const obj = json as Record<string, unknown>;
  if (op === 'CHAT' || op === 'CUSTOM') {
    const choice = (obj.choices as unknown[] | undefined)?.[0] as
      | { message?: { content?: string } }
      | undefined;
    return choice?.message?.content ?? null;
  }
  if (op === 'COMPLETE') {
    const choice = (obj.choices as unknown[] | undefined)?.[0] as
      | { text?: string }
      | undefined;
    return choice?.text ?? null;
  }
  if (op === 'EMBED') {
    const data = obj.data as Array<{ embedding?: number[] }> | undefined;
    if (!data?.length) return null;
    const first = data[0];
    return `[${data.length} embedding${data.length === 1 ? '' : 's'}, dim=${
      first?.embedding?.length ?? 0
    }]`;
  }
  return null;
}

// --------------------------------------------------------------------------
// Anthropic Messages API
// --------------------------------------------------------------------------

async function invokeAnthropic(
  input: ProxyInvokeInput,
  start: number,
): Promise<ProxyCallResult> {
  if (input.call.operation === 'EMBED') {
    return fail(start, 'Anthropic does not support embeddings via the Messages API');
  }
  const url = 'https://api.anthropic.com/v1/messages';
  const { system, messages } = splitSystem(input.call.messages ?? []);
  const body: Record<string, unknown> = {
    model: input.modelId || 'claude-3-5-sonnet-20240620',
    max_tokens: input.call.maxTokens ?? 1024,
    messages:
      messages.length > 0
        ? messages
        : [{ role: 'user', content: input.call.prompt ?? '' }],
    ...(system ? { system } : {}),
    ...safeExtra(input.call.extra, ANTHROPIC_PROTECTED),
    ...(input.call.temperature != null ? { temperature: input.call.temperature } : {}),
  };

  const res = await fetchWithTimeout(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': input.credentials,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  });
  const json = await parseJsonSafe(res);
  const latencyMs = Date.now() - start;

  if (!res.ok) {
    return {
      status: res.status,
      latencyMs,
      outputText: null,
      raw: json,
      tokensIn: null,
      tokensOut: null,
      errorMessage: `upstream ${res.status}`,
    };
  }

  const content = (json && (json as Record<string, unknown>).content) as
    | Array<{ type?: string; text?: string }>
    | undefined;
  // `?? null` would leak `''` when the response has non-text blocks only
  // (e.g. tool_use or image). Use `|| null` so an empty join collapses to
  // null, matching how OpenAI/HF extractors signal "no text output".
  const outputText =
    content
      ?.filter((c) => c.type === 'text')
      .map((c) => c.text ?? '')
      .join('\n') || null;
  const usage = (json && (json as Record<string, unknown>).usage) as
    | { input_tokens?: number; output_tokens?: number }
    | undefined;

  return {
    status: res.status,
    latencyMs,
    outputText,
    raw: json,
    tokensIn: usage?.input_tokens ?? null,
    tokensOut: usage?.output_tokens ?? null,
    errorMessage: null,
  };
}

function splitSystem(messages: WorkbenchMessage[]): {
  system: string | null;
  messages: WorkbenchMessage[];
} {
  const sys = messages.filter((m) => m.role === 'system');
  const rest = messages.filter((m) => m.role !== 'system');
  return {
    system: sys.length > 0 ? sys.map((m) => m.content).join('\n\n') : null,
    messages: rest,
  };
}

// --------------------------------------------------------------------------
// HuggingFace Inference Endpoints / Inference API
// --------------------------------------------------------------------------

async function invokeHuggingFace(
  input: ProxyInvokeInput,
  start: number,
): Promise<ProxyCallResult> {
  if (!input.endpointUrl) return fail(start, 'endpointUrl is required');

  const body: Record<string, unknown> = {
    inputs:
      input.call.operation === 'EMBED'
        ? input.call.input
        : input.call.prompt ?? messagesToPrompt(input.call.messages),
    parameters: {
      ...(input.call.temperature != null ? { temperature: input.call.temperature } : {}),
      ...(input.call.maxTokens != null ? { max_new_tokens: input.call.maxTokens } : {}),
    },
    ...safeExtra(input.call.extra, HUGGINGFACE_PROTECTED),
  };
  // `parameters` is in the denylist so the trainer cannot override the
  // temperature/max_new_tokens we set from the validated input.

  const res = await fetchWithTimeout(input.endpointUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...bearerHeader(input),
    },
    body: JSON.stringify(body),
  });
  const json = await parseJsonSafe(res);
  const latencyMs = Date.now() - start;

  if (!res.ok) {
    return {
      status: res.status,
      latencyMs,
      outputText: null,
      raw: json,
      tokensIn: null,
      tokensOut: null,
      errorMessage: `upstream ${res.status}`,
    };
  }

  return {
    status: res.status,
    latencyMs,
    outputText: extractHuggingFaceOutput(input.call.operation, json),
    raw: json,
    tokensIn: null,
    tokensOut: null,
    errorMessage: null,
  };
}

function extractHuggingFaceOutput(op: ModelCallOperation, json: unknown): string | null {
  if (op === 'EMBED') {
    if (Array.isArray(json)) {
      return `[${json.length} embedding${json.length === 1 ? '' : 's'}]`;
    }
    return null;
  }
  if (Array.isArray(json)) {
    const first = json[0] as { generated_text?: string; summary_text?: string } | undefined;
    return first?.generated_text ?? first?.summary_text ?? null;
  }
  if (json && typeof json === 'object') {
    const obj = json as Record<string, unknown>;
    if (typeof obj.generated_text === 'string') return obj.generated_text;
  }
  return null;
}

// --------------------------------------------------------------------------
// RAW_HTTPS — power-user passthrough, we only inject auth
// --------------------------------------------------------------------------

async function invokeRawHttps(
  input: ProxyInvokeInput,
  start: number,
): Promise<ProxyCallResult> {
  if (!input.endpointUrl) return fail(start, 'endpointUrl is required');

  const body = input.call.extra ?? {
    messages: input.call.messages,
    prompt: input.call.prompt,
    input: input.call.input,
    temperature: input.call.temperature,
    maxTokens: input.call.maxTokens,
  };

  const res = await fetchWithTimeout(input.endpointUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...bearerHeader(input),
    },
    body: JSON.stringify(body),
  });
  const json = await parseJsonSafe(res);
  const latencyMs = Date.now() - start;

  return {
    status: res.status,
    latencyMs,
    outputText:
      typeof json === 'string'
        ? json
        : typeof (json as Record<string, unknown>)?.output === 'string'
          ? ((json as Record<string, unknown>).output as string)
          : null,
    raw: json,
    tokensIn: null,
    tokensOut: null,
    errorMessage: res.ok ? null : `upstream ${res.status}`,
  };
}

// --------------------------------------------------------------------------
// AWS Bedrock — SigV4 signed Invoke
// --------------------------------------------------------------------------

async function invokeBedrock(
  input: ProxyInvokeInput,
  start: number,
): Promise<ProxyCallResult> {
  if (!input.region) return fail(start, 'region is required for Bedrock');
  if (!input.modelId) return fail(start, 'modelId is required for Bedrock');

  // Credentials format: "accessKeyId:secretAccessKey" or
  // "accessKeyId:secretAccessKey:sessionToken". Keeping this minimal
  // rather than yet another secret shape — companies paste their IAM
  // access key pair exactly as they would into an `.aws/credentials` file.
  const parts = input.credentials.split(':');
  if (parts.length < 2) {
    return fail(start, 'Bedrock credentials must be in the form "accessKeyId:secretAccessKey[:sessionToken]"');
  }
  // Session tokens returned by STS frequently contain `:` characters, so
  // take the first two segments as the key pair and rejoin the remainder
  // as the session token (undefined when only a static key pair is given).
  const [accessKeyId, secretAccessKey, ...rest] = parts;
  const sessionToken = rest.length > 0 ? rest.join(':') : undefined;
  if (!accessKeyId || !secretAccessKey) {
    return fail(start, 'Bedrock credentials must contain both accessKeyId and secretAccessKey');
  }

  const host = `bedrock-runtime.${input.region}.amazonaws.com`;
  const path = `/model/${encodeURIComponent(input.modelId)}/invoke`;
  const body = buildBedrockBody(input);
  const payload = JSON.stringify(body);

  const signer = new SignatureV4({
    service: 'bedrock',
    region: input.region,
    credentials: {
      accessKeyId,
      secretAccessKey,
      ...(sessionToken ? { sessionToken } : {}),
    },
    sha256: Sha256,
  });
  const signed = await signer.sign(
    new HttpRequest({
      method: 'POST',
      hostname: host,
      path,
      headers: {
        host,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: payload,
    }),
  );

  const res = await fetchWithTimeout(`https://${host}${path}`, {
    method: 'POST',
    headers: signed.headers as Record<string, string>,
    body: payload,
  });
  const json = await parseJsonSafe(res);
  const latencyMs = Date.now() - start;

  if (!res.ok) {
    return {
      status: res.status,
      latencyMs,
      outputText: null,
      raw: json,
      tokensIn: null,
      tokensOut: null,
      errorMessage: `upstream ${res.status}`,
    };
  }

  return {
    status: res.status,
    latencyMs,
    outputText: extractBedrockOutput(input.modelId, json),
    raw: json,
    tokensIn: null,
    tokensOut: null,
    errorMessage: null,
  };
}

function buildBedrockBody(input: ProxyInvokeInput): Record<string, unknown> {
  const modelId = input.modelId ?? '';
  // Bedrock's request schema is per-model-family. We handle the three most
  // common shapes (Anthropic Claude, Meta Llama, Amazon Titan) and fall
  // back to a generic shape for everything else — trainers can still push
  // arbitrary payload via `extra`.
  if (modelId.includes('anthropic.claude')) {
    const { system, messages } = splitSystem(input.call.messages ?? []);
    return {
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: input.call.maxTokens ?? 1024,
      messages:
        messages.length > 0
          ? messages
          : [{ role: 'user', content: input.call.prompt ?? '' }],
      ...(system ? { system } : {}),
      ...safeExtra(input.call.extra, BEDROCK_CLAUDE_PROTECTED),
      ...(input.call.temperature != null ? { temperature: input.call.temperature } : {}),
    };
  }
  if (modelId.includes('meta.llama')) {
    return {
      prompt: input.call.prompt ?? messagesToPrompt(input.call.messages),
      max_gen_len: input.call.maxTokens ?? 512,
      ...safeExtra(input.call.extra, BEDROCK_LLAMA_PROTECTED),
      ...(input.call.temperature != null ? { temperature: input.call.temperature } : {}),
    };
  }
  if (modelId.includes('amazon.titan')) {
    return {
      inputText: input.call.prompt ?? messagesToPrompt(input.call.messages),
      textGenerationConfig: {
        maxTokenCount: input.call.maxTokens ?? 512,
        ...(input.call.temperature != null ? { temperature: input.call.temperature } : {}),
      },
      ...safeExtra(input.call.extra, BEDROCK_TITAN_PROTECTED),
    };
  }
  return {
    prompt: input.call.prompt ?? messagesToPrompt(input.call.messages),
    ...safeExtra(input.call.extra, BEDROCK_GENERIC_PROTECTED),
  };
}

function extractBedrockOutput(modelId: string, json: unknown): string | null {
  if (!json || typeof json !== 'object') return null;
  const obj = json as Record<string, unknown>;
  if (modelId.includes('anthropic.claude')) {
    const content = obj.content as Array<{ type?: string; text?: string }> | undefined;
    // Same empty-string guard as `invokeAnthropic` — no text blocks means
    // the assistant only returned tool_use/image content, which the UI
    // renders as "no textual output" (null), not an empty string.
    return (
      content
        ?.filter((c) => c.type === 'text')
        .map((c) => c.text ?? '')
        .join('\n') || null
    );
  }
  if (modelId.includes('meta.llama')) {
    return typeof obj.generation === 'string' ? obj.generation : null;
  }
  if (modelId.includes('amazon.titan')) {
    const results = obj.results as Array<{ outputText?: string }> | undefined;
    return results?.[0]?.outputText ?? null;
  }
  if (typeof obj.completion === 'string') return obj.completion;
  if (typeof obj.output === 'string') return obj.output;
  return null;
}

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

/**
 * Strip proxy-owned keys from the trainer-supplied `extra` object. The
 * `extra` passthrough is useful for vendor-specific toggles (top_p,
 * stop, tools, etc.) but MUST NOT let a trainer override fields the
 * proxy controls — notably `model`, which would let them swap the
 * company's chosen `modelId` for a more expensive one and charge it
 * to the company's API key.
 */
function safeExtra(
  extra: Record<string, unknown> | undefined,
  denylist: readonly string[],
): Record<string, unknown> {
  if (!extra) return {};
  const out: Record<string, unknown> = {};
  const blocked = new Set(denylist);
  for (const [k, v] of Object.entries(extra)) {
    if (blocked.has(k)) continue;
    out[k] = v;
  }
  return out;
}

// `stream` is blocked across all providers: letting a trainer flip the
// upstream into SSE/chunked mode breaks `parseJsonSafe` and bypasses
// `fetchWithTimeout` (which only guards header receipt, not body
// streaming), producing garbled ModelCall audit rows.
// `stream` is blocked across all providers (see note above). `n` /
// `num_return_sequences` / `numResults` are cost-amplifiers — a trainer
// setting `n: 128` would produce 128× the output tokens on the company's
// API key. `temperature` is controlled by `base` (Zod-validated, capped at
// 2) and must not be overridable.
const OPENAI_PROTECTED = [
  'model',
  'messages',
  'prompt',
  'input',
  'max_tokens',
  'n',
  'best_of',
  'temperature',
  'stream',
] as const;
const ANTHROPIC_PROTECTED = [
  'model',
  'messages',
  'system',
  'max_tokens',
  'anthropic_version',
  'temperature',
  'stream',
] as const;
const HUGGINGFACE_PROTECTED = ['inputs', 'parameters', 'stream'] as const;
const BEDROCK_CLAUDE_PROTECTED = [
  'anthropic_version',
  'max_tokens',
  'messages',
  'system',
  'temperature',
  'stream',
] as const;
const BEDROCK_LLAMA_PROTECTED = [
  'prompt',
  'max_gen_len',
  'temperature',
  'stream',
] as const;
const BEDROCK_TITAN_PROTECTED = [
  'inputText',
  'textGenerationConfig',
  'numResults',
  'stream',
] as const;
const BEDROCK_GENERIC_PROTECTED = ['prompt', 'stream'] as const;

function bearerHeader(input: ProxyInvokeInput): Record<string, string> {
  if (input.authKind === 'none' || !input.credentials) return {};
  if (input.authKind === 'aws_sigv4') return {};
  return { Authorization: `Bearer ${input.credentials}` };
}

function messagesToPrompt(messages: WorkbenchMessage[] | undefined): string {
  if (!messages?.length) return '';
  return messages
    .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
    .join('\n\n');
}

async function parseJsonSafe(res: Response): Promise<unknown> {
  const text = await res.text().catch(() => '');
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { _raw: text.slice(0, 4000) };
  }
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), PROXY_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: ctl.signal });
  } finally {
    clearTimeout(t);
  }
}

function endsWithSlash(url: string): string {
  return url.endsWith('/') ? url : `${url}/`;
}

function errorMessage(e: unknown): string {
  if (e instanceof Error) {
    if (e.name === 'AbortError') return `request timed out after ${PROXY_TIMEOUT_MS}ms`;
    return e.message;
  }
  return String(e);
}

function fail(start: number, message: string): ProxyCallResult {
  return {
    status: 0,
    latencyMs: Date.now() - start,
    outputText: null,
    raw: null,
    tokensIn: null,
    tokensOut: null,
    errorMessage: message,
  };
}
