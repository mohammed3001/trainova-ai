// T8.D — Evaluation pipelines client-safe API helpers (proxied through
// `/api/proxy/[...path]` so cookies + trusted client IP are attached
// server-side, matching the pattern used by interviews-api / chat-ai-api).

import type {
  ApplicationPipelineSnapshotDto,
  ApplicationPipelineProgressDto,
  CreatePipelineInput,
  EvaluationPipelineDto,
  ReplaceStagesInput,
  UpdatePipelineInput,
  AdvanceStageInput,
  RejectStageInput,
  SkipStageInput,
} from '@trainova/shared';

export type {
  ApplicationPipelineSnapshotDto,
  ApplicationPipelineProgressDto,
  EvaluationPipelineDto,
};

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const init: RequestInit = {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
  };
  if (body !== undefined) init.body = JSON.stringify(body);
  const res = await fetch(`/api/proxy${path}`, init);
  if (!res.ok) {
    const text = await res.text();
    let message = text || `Request failed (${res.status})`;
    try {
      const parsed = JSON.parse(text) as { message?: unknown };
      if (parsed && typeof parsed.message === 'string') message = parsed.message;
    } catch {
      // non-JSON body — leave the raw text in `message`.
    }
    const err: Error & { status?: number } = new Error(message);
    err.status = res.status;
    throw err;
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const createPipeline = (body: CreatePipelineInput) =>
  request<EvaluationPipelineDto>('POST', '/evaluation-pipelines', body);

export const getPipelineForRequest = (requestId: string) =>
  request<EvaluationPipelineDto | null>(
    'GET',
    `/job-requests/${requestId}/evaluation-pipeline`,
  );

export const updatePipeline = (id: string, body: UpdatePipelineInput) =>
  request<EvaluationPipelineDto>('PATCH', `/evaluation-pipelines/${id}`, body);

export const replacePipelineStages = (id: string, body: ReplaceStagesInput) =>
  request<EvaluationPipelineDto>('PUT', `/evaluation-pipelines/${id}/stages`, body);

export const deletePipeline = (id: string) =>
  request<void>('DELETE', `/evaluation-pipelines/${id}`);

export const getApplicationProgress = (applicationId: string) =>
  request<ApplicationPipelineSnapshotDto | null>(
    'GET',
    `/applications/${applicationId}/evaluation-progress`,
  );

export const startApplicationProgress = (applicationId: string) =>
  request<ApplicationPipelineProgressDto>(
    'POST',
    `/applications/${applicationId}/evaluation-progress`,
  );

export const advanceStage = (progressId: string, body: AdvanceStageInput) =>
  request<ApplicationPipelineProgressDto>(
    'POST',
    `/evaluation-progress/${progressId}/advance`,
    body,
  );

export const rejectStage = (progressId: string, body: RejectStageInput) =>
  request<ApplicationPipelineProgressDto>(
    'POST',
    `/evaluation-progress/${progressId}/reject`,
    body,
  );

export const skipStage = (progressId: string, body: SkipStageInput) =>
  request<ApplicationPipelineProgressDto>(
    'POST',
    `/evaluation-progress/${progressId}/skip`,
    body,
  );

export const withdrawProgress = (progressId: string) =>
  request<ApplicationPipelineProgressDto>(
    'POST',
    `/evaluation-progress/${progressId}/withdraw`,
  );
