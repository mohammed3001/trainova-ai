import type { ModelAuthKind, ModelProvider } from '@trainova/shared';

/**
 * Lightweight provider adapters used by the Models service to (a) probe
 * a connection (`/v1/models` style endpoint) and (b) — once T4.B Workbench
 * lands — proxy chat/completion calls. Each adapter is intentionally
 * thin: we delegate the actual network call to the platform's `fetch`
 * and only know enough about each vendor's auth header convention to
 * authenticate the request.
 */

export interface ProbeInput {
  endpointUrl: string | null;
  modelId: string | null;
  region: string | null;
  authKind: ModelAuthKind;
  /** Decrypted credentials, or empty string if `authKind === 'none'`. */
  credentials: string;
}

export interface ProbeResult {
  ok: boolean;
  status: number | null;
  detail?: string;
  error?: string;
}

const PROBE_TIMEOUT_MS = 8_000;

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs = PROBE_TIMEOUT_MS,
): Promise<Response> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: ctl.signal });
  } finally {
    clearTimeout(t);
  }
}

function authHeader(input: ProbeInput): Record<string, string> {
  switch (input.authKind) {
    case 'api_key':
    case 'bearer':
      return { Authorization: `Bearer ${input.credentials}` };
    case 'aws_sigv4':
      // Bedrock uses SigV4; we only support DRAFT-status connections at
      // probe time and surface a clear error rather than ship a half-baked
      // sigv4 implementation. T4.B will plug in the AWS SDK signer.
      return {};
    case 'none':
      return {};
    default:
      return {};
  }
}

async function probeOpenAiCompatible(input: ProbeInput): Promise<ProbeResult> {
  if (!input.endpointUrl) {
    return { ok: false, status: null, error: 'endpointUrl is required' };
  }
  // Many self-hosted OpenAI-compatible servers expose /models; OpenAI itself
  // responds 200 with a list. Accept any 2xx as success.
  const url = new URL('models', endsWithSlash(input.endpointUrl)).toString();
  try {
    const res = await fetchWithTimeout(url, {
      method: 'GET',
      headers: { Accept: 'application/json', ...authHeader(input) },
    });
    if (res.ok) {
      return { ok: true, status: res.status, detail: 'GET /models 2xx' };
    }
    const body = await res.text().catch(() => '');
    return {
      ok: false,
      status: res.status,
      error: `GET /models ${res.status}${body ? `: ${truncate(body, 200)}` : ''}`,
    };
  } catch (e) {
    return { ok: false, status: null, error: errorMessage(e) };
  }
}

async function probeAnthropic(input: ProbeInput): Promise<ProbeResult> {
  // Anthropic does not expose a list-models endpoint, so we issue a 1-token
  // chat completion against the cheapest model. If a modelId is provided
  // we prefer it, otherwise we fall back to a known cheap default.
  const url = 'https://api.anthropic.com/v1/messages';
  try {
    const res = await fetchWithTimeout(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': input.credentials,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: input.modelId || 'claude-3-haiku-20240307',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'ping' }],
      }),
    });
    if (res.ok) {
      return { ok: true, status: res.status, detail: 'POST /v1/messages 2xx' };
    }
    const body = await res.text().catch(() => '');
    return {
      ok: false,
      status: res.status,
      error: `POST /v1/messages ${res.status}${body ? `: ${truncate(body, 200)}` : ''}`,
    };
  } catch (e) {
    return { ok: false, status: null, error: errorMessage(e) };
  }
}

async function probeHuggingFace(input: ProbeInput): Promise<ProbeResult> {
  if (!input.endpointUrl) {
    return { ok: false, status: null, error: 'endpointUrl is required' };
  }
  // Inference Endpoints / Inference API both accept a HEAD-style health
  // check via a GET on the deployment URL. Auth header is optional.
  try {
    const res = await fetchWithTimeout(input.endpointUrl, {
      method: 'GET',
      headers: { Accept: 'application/json', ...authHeader(input) },
    });
    // HF endpoints often return 405 for GET on POST-only routes — treat
    // 2xx + 404 + 405 as "endpoint reachable, auth understood". 401 / 403
    // mean the credential was rejected; surface that as a real failure so
    // the connection doesn't auto-promote DRAFT → ACTIVE on a bad key.
    if (isReachableNonAuthFailure(res.status)) {
      return {
        ok: true,
        status: res.status,
        detail: `GET endpoint ${res.status} (reachable)`,
      };
    }
    const body = await res.text().catch(() => '');
    return {
      ok: false,
      status: res.status,
      error: `GET endpoint ${res.status}${body ? `: ${truncate(body, 200)}` : ''}`,
    };
  } catch (e) {
    return { ok: false, status: null, error: errorMessage(e) };
  }
}

async function probeRawHttps(input: ProbeInput): Promise<ProbeResult> {
  if (!input.endpointUrl) {
    return { ok: false, status: null, error: 'endpointUrl is required' };
  }
  try {
    const res = await fetchWithTimeout(input.endpointUrl, {
      method: 'GET',
      headers: { Accept: 'application/json', ...authHeader(input) },
    });
    // Same auth-vs-reachability split as HuggingFace — 401/403 must not
    // be treated as healthy or the row would silently promote to ACTIVE
    // with a rejected credential.
    const ok = isReachableNonAuthFailure(res.status);
    return {
      ok,
      status: res.status,
      detail: ok ? `GET endpoint ${res.status}` : undefined,
      error: ok
        ? undefined
        : `GET endpoint ${res.status} (auth or upstream failure)`,
    };
  } catch (e) {
    return { ok: false, status: null, error: errorMessage(e) };
  }
}

function probeBedrock(input: ProbeInput): ProbeResult {
  if (!input.region) {
    return { ok: false, status: null, error: 'region is required for Bedrock' };
  }
  // We don't ship the AWS SigV4 signer in T4.A — connections can be saved
  // (DRAFT) but the live probe is deferred until T4.B plugs in the AWS
  // SDK. Return a deterministic message so the UI shows a clear hint.
  return {
    ok: false,
    status: null,
    error:
      'Bedrock live probe is not enabled yet. The connection will activate ' +
      'once the SigV4 proxy ships in T4.B.',
  };
}

export async function probeModelConnection(
  provider: ModelProvider,
  input: ProbeInput,
): Promise<ProbeResult> {
  switch (provider) {
    case 'OPENAI_COMPATIBLE':
      return probeOpenAiCompatible(input);
    case 'ANTHROPIC':
      return probeAnthropic(input);
    case 'HUGGINGFACE':
      return probeHuggingFace(input);
    case 'RAW_HTTPS':
      return probeRawHttps(input);
    case 'BEDROCK':
      return probeBedrock(input);
    default:
      return { ok: false, status: null, error: `unknown provider: ${provider}` };
  }
}

function endsWithSlash(url: string): string {
  return url.endsWith('/') ? url : `${url}/`;
}

/**
 * "Reachable but not an auth failure." 2xx is success, 404/405 indicate the
 * endpoint exists but the verb/path is wrong (HF inference deployments
 * commonly return 405 for GET) — both prove the credential was accepted at
 * the network edge. 401/403 explicitly mean the credential was rejected
 * and must not promote a connection to ACTIVE.
 */
function isReachableNonAuthFailure(status: number): boolean {
  if (status >= 200 && status < 300) return true;
  return status === 404 || status === 405;
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max)}…`;
}

function errorMessage(e: unknown): string {
  if (e instanceof Error) {
    if (e.name === 'AbortError') return `request timed out after ${PROBE_TIMEOUT_MS}ms`;
    return e.message;
  }
  return String(e);
}
