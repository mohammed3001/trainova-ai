import { z } from 'zod';

/**
 * Tier 9.A — Company team collaboration.
 *
 * Companies can now have more than just an `OWNER`. The `CompanyMember`
 * table already existed; this tier adds the public-facing operations for
 * inviting, accepting, listing, role-changing and removing members, plus
 * a token-backed `CompanyInvitation` that survives an email round-trip.
 *
 * Authorization rules are enforced server-side:
 *  - OWNER         → full control
 *  - ADMIN         → invite/remove/role-change everyone except OWNER
 *  - RECRUITER     → no member-management permissions (read-only here)
 *  - VIEWER        → no member-management permissions (read-only here)
 */

export const companyMemberRoleSchema = z.enum(['OWNER', 'ADMIN', 'RECRUITER', 'VIEWER']);
export type CompanyMemberRole = z.infer<typeof companyMemberRoleSchema>;

/** Roles assignable through the public API — `OWNER` is reserved for
 *  the user who created the company and cannot be granted via invite. */
export const assignableMemberRoleSchema = z.enum(['ADMIN', 'RECRUITER', 'VIEWER']);
export type AssignableMemberRole = z.infer<typeof assignableMemberRoleSchema>;

export const companyInvitationStatusSchema = z.enum([
  'PENDING',
  'ACCEPTED',
  'REVOKED',
  'EXPIRED',
]);
export type CompanyInvitationStatus = z.infer<typeof companyInvitationStatusSchema>;

export const INVITATION_TTL_DAYS = 14;
export const MAX_PENDING_INVITATIONS_PER_COMPANY = 50;

const trimmedEmail = z
  .string()
  .trim()
  .min(3)
  .max(254)
  .email({ message: 'Invalid email' })
  .transform((v) => v.toLowerCase());

export const createInvitationSchema = z.object({
  email: trimmedEmail,
  role: assignableMemberRoleSchema,
});
export type CreateInvitationInput = z.infer<typeof createInvitationSchema>;

export const acceptInvitationSchema = z.object({
  token: z.string().trim().min(16).max(256),
});
export type AcceptInvitationInput = z.infer<typeof acceptInvitationSchema>;

export const updateMemberRoleSchema = z.object({
  role: assignableMemberRoleSchema,
});
export type UpdateMemberRoleInput = z.infer<typeof updateMemberRoleSchema>;

export interface CompanyMemberDto {
  id: string;
  userId: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  role: CompanyMemberRole;
  createdAt: string;
  updatedAt: string;
}

export interface CompanyInvitationDto {
  id: string;
  email: string;
  role: CompanyMemberRole;
  status: CompanyInvitationStatus;
  expiresAt: string;
  createdAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
  createdBy: { id: string; name: string | null } | null;
}

export interface CompanyTeamDto {
  companyId: string;
  companyName: string;
  members: CompanyMemberDto[];
  invitations: CompanyInvitationDto[];
}

/** Returned to a logged-in user inspecting an invitation token before
 *  deciding whether to accept. Email match is enforced server-side at
 *  accept time but surfaced here for UX. */
export interface InvitationPreviewDto {
  email: string;
  role: CompanyMemberRole;
  status: CompanyInvitationStatus;
  companyName: string;
  inviterName: string | null;
  expiresAt: string;
  emailMatchesViewer: boolean;
}

/**
 * Returned from `POST /team/invitations/accept`. Accepting an invitation
 * may transition the caller's `User.role` (e.g. `TRAINER` →
 * `COMPANY_MEMBER`), which invalidates their existing JWT — the
 * jwt strategy enforces `user.role === payload.role`. We therefore
 * re-issue an access token here so the client can replace the stale
 * cookie before navigating into the company workspace. The full user
 * payload mirrors `/auth/login` so callers can update their session
 * cookie pair (token + role) atomically.
 */
export interface AcceptInvitationResultDto {
  companyId: string;
  /** The role granted on this company (mirrors `CompanyMember.role`). */
  role: CompanyMemberRole;
  /** Fresh access token reflecting any `User.role` transition. */
  accessToken: string;
  user: { id: string; email: string; role: string };
}
