// T9.A — Team collaboration client-safe API helpers.
//
// Browser-side bundles cannot import `authedFetch` from `lib/api.ts`
// because it pulls in `next/headers`. We therefore route every team
// management call through the existing `/api/proxy/[...path]` catch-all
// (see `interviews-api.ts` / `chat-ai-api.ts` for the established
// pattern), which attaches the session cookie server-side.

import type {
  AssignableMemberRole,
  CompanyInvitationDto,
  CompanyMemberDto,
  CompanyTeamDto,
  CreateInvitationInput,
  InvitationPreviewDto,
  UpdateMemberRoleInput,
} from '@trainova/shared';

export type {
  AssignableMemberRole,
  CompanyInvitationDto,
  CompanyMemberDto,
  CompanyTeamDto,
  CreateInvitationInput,
  InvitationPreviewDto,
  UpdateMemberRoleInput,
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

export const getTeam = () => request<CompanyTeamDto>('GET', '/team/me');

export const inviteMember = (body: CreateInvitationInput) =>
  request<CompanyInvitationDto>('POST', '/team/invitations', body);

export const revokeInvitation = (id: string) =>
  request<CompanyInvitationDto>('POST', `/team/invitations/${id}/revoke`);

export const previewInvitation = (token: string) =>
  request<InvitationPreviewDto>('GET', `/team/invitations/preview/${encodeURIComponent(token)}`);

export const acceptInvitation = (token: string) =>
  request<{ companyId: string; role: string }>('POST', '/team/invitations/accept', { token });

export const updateMemberRole = (id: string, body: UpdateMemberRoleInput) =>
  request<CompanyMemberDto>('PATCH', `/team/members/${id}`, body);

export const removeMember = (id: string) =>
  request<void>('DELETE', `/team/members/${id}`);
