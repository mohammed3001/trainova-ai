/**
 * Thin LLM provider abstraction for the AI Assistant module.
 *
 * Three providers are supported:
 *   - "openai"  — calls OpenAI Chat Completions over fetch.
 *   - "mock"    — deterministic local generator. Used in dev/CI when no
 *                 API key is set, and as a fallback when the upstream
 *                 provider returns a non-2xx.
 *
 * The choice is selected at the *call site* via env (`AI_PROVIDER` and
 * `OPENAI_API_KEY`). We deliberately avoid the official `openai` npm
 * package: it pulls in a large dependency tree, and Trainova already
 * speaks the OpenAI HTTP shape from `apps/api/src/models/model-proxy.ts`.
 *
 * **Cost accounting.** OpenAI returns token usage on every response.
 * `microCostsForModel` translates (model, prompt+completion tokens) into
 * micro-cents (1e-6 USD cent) for sub-cent precision. Pricing is hard-
 * coded — when OpenAI changes prices we bump this table. The numbers
 * below match OpenAI's published list price for the gpt-4o-mini family
 * as of 2025-Q1; if a newer model isn't in the table we charge the
 * conservative gpt-4o-mini rate.
 */

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LlmCallInput {
  messages: ChatMessage[];
  /** Lower temperature → more deterministic. */
  temperature?: number;
  /** Hard cap on completion tokens. */
  maxTokens?: number;
  /** When true, instructs the provider to return strict JSON. */
  jsonMode?: boolean;
}

export interface LlmCallResult {
  text: string;
  modelUsed: string;
  provider: 'openai' | 'mock';
  promptTokens: number;
  completionTokens: number;
  costMicros: number;
  durationMs: number;
}

interface ProviderEnv {
  provider: 'openai' | 'mock';
  apiKey: string | null;
  defaultModel: string;
}

function readEnv(): ProviderEnv {
  const apiKey = (process.env.OPENAI_API_KEY ?? '').trim() || null;
  // AI_PROVIDER=openai forces real calls; mock or missing key falls back
  // to the deterministic local stub. We never silently call OpenAI when
  // the key is empty — that would leak real prompts to a 401 response.
  const requested = (process.env.AI_PROVIDER ?? 'mock').toLowerCase();
  const provider: 'openai' | 'mock' =
    requested === 'openai' && apiKey ? 'openai' : 'mock';
  const defaultModel = (process.env.AI_ASSIST_MODEL ?? 'gpt-4o-mini').trim() || 'gpt-4o-mini';
  return { provider, apiKey, defaultModel };
}

const MODEL_PRICES_PER_1M_TOKENS_USD: Record<string, { prompt: number; completion: number }> = {
  // OpenAI list prices (USD per 1M tokens). Last updated 2025-Q1.
  'gpt-4o-mini': { prompt: 0.15, completion: 0.6 },
  'gpt-4o': { prompt: 5.0, completion: 15.0 },
  'gpt-4.1-mini': { prompt: 0.4, completion: 1.6 },
};

function microCostsForModel(model: string, promptTokens: number, completionTokens: number): number {
  const price =
    MODEL_PRICES_PER_1M_TOKENS_USD[model] ??
    MODEL_PRICES_PER_1M_TOKENS_USD['gpt-4o-mini'] ??
    { prompt: 0, completion: 0 };
  const promptMicros = Math.round(promptTokens * price.prompt * 100);
  const completionMicros = Math.round(completionTokens * price.completion * 100);
  return promptMicros + completionMicros;
}

/**
 * Best-effort token estimator for the mock provider so cost accounting
 * looks sane in dev/CI. We intentionally don't ship `tiktoken` (heavy
 * native binding); 4 chars-per-token is the OpenAI rule-of-thumb and is
 * within 10–20 % of reality for English/Arabic/code mixes.
 */
function approxTokenCount(text: string): number {
  if (!text) return 0;
  return Math.max(1, Math.ceil(text.length / 4));
}

interface OpenAiChatResponse {
  choices?: Array<{ message?: { content?: string | null } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  model?: string;
  error?: { message?: string };
}

async function callOpenAi(env: ProviderEnv, input: LlmCallInput): Promise<LlmCallResult> {
  if (!env.apiKey) throw new Error('OPENAI_API_KEY is not set');
  const startedAt = Date.now();
  const body: Record<string, unknown> = {
    model: env.defaultModel,
    messages: input.messages,
    temperature: input.temperature ?? 0.2,
  };
  if (input.maxTokens) body.max_tokens = input.maxTokens;
  if (input.jsonMode) body.response_format = { type: 'json_object' };

  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), 30_000);
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const json = (await res.json()) as OpenAiChatResponse;
    if (!res.ok) {
      throw new Error(`OpenAI ${res.status}: ${json.error?.message ?? res.statusText}`);
    }
    const text = json.choices?.[0]?.message?.content ?? '';
    const promptTokens = json.usage?.prompt_tokens ?? 0;
    const completionTokens = json.usage?.completion_tokens ?? 0;
    const modelUsed = json.model ?? env.defaultModel;
    return {
      text,
      modelUsed,
      provider: 'openai',
      promptTokens,
      completionTokens,
      costMicros: microCostsForModel(modelUsed, promptTokens, completionTokens),
      durationMs: Date.now() - startedAt,
    };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Deterministic mock provider used in dev/CI. It returns *valid JSON
 * shaped to the prompt's instructions* by echoing key inputs back. The
 * goal is not realism but: (a) the request pipeline runs end-to-end,
 * (b) CI Playwright can assert on shape without a network dependency,
 * (c) developers see the prompt round-trip without paying for tokens.
 */
function callMock(env: ProviderEnv, input: LlmCallInput): LlmCallResult {
  const startedAt = Date.now();
  let userMessage = '';
  for (let i = input.messages.length - 1; i >= 0; i -= 1) {
    const msg = input.messages[i];
    if (msg && msg.role === 'user') {
      userMessage = msg.content ?? '';
      break;
    }
  }
  // Heuristic: if the system prompt asked for JSON, return JSON. We
  // detect that via either jsonMode or a "Return JSON" marker.
  const wantsJson =
    input.jsonMode ||
    input.messages.some((m) => /Return strict JSON|Respond with JSON/i.test(m.content));
  let text: string;
  if (wantsJson) {
    text = JSON.stringify({
      _mock: true,
      echo: userMessage.slice(0, 200),
      generatedAt: new Date().toISOString(),
    });
  } else {
    text = `[mock provider] ${userMessage.slice(0, 280)}`;
  }
  const promptTokens = input.messages.reduce((acc, m) => acc + approxTokenCount(m.content), 0);
  const completionTokens = approxTokenCount(text);
  return {
    text,
    modelUsed: 'mock',
    provider: 'mock',
    promptTokens,
    completionTokens,
    costMicros: 0,
    durationMs: Date.now() - startedAt,
  };
}

export async function callLlm(input: LlmCallInput): Promise<LlmCallResult> {
  const env = readEnv();
  if (env.provider === 'openai') {
    try {
      return await callOpenAi(env, input);
    } catch (err) {
      // We do NOT silently fall back to the mock when OpenAI is configured
      // but failing — that would mask outages and make AB-tests bogus.
      // Surface the error to the caller; the service layer logs it on
      // the AiAssistRequest row and returns a clean 502 to the client.
      throw err instanceof Error ? err : new Error(String(err));
    }
  }
  return callMock(env, input);
}

/** Exposed for the controller's `/health` introspection. */
export function describeProvider(): { provider: 'openai' | 'mock'; defaultModel: string } {
  const env = readEnv();
  return { provider: env.provider, defaultModel: env.defaultModel };
}
