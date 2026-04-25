import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@trainova/db';
import {
  type CompanyInvitationDto,
  type CompanyMemberDto,
  type CompanyMemberRole,
  type CompanyTeamDto,
  type CreateInvitationInput,
  type InvitationPreviewDto,
  type UpdateMemberRoleInput,
  INVITATION_TTL_DAYS,
  MAX_PENDING_INVITATIONS_PER_COMPANY,
} from '@trainova/shared';
import { createHash, randomBytes } from 'node:crypto';
import { EmailService } from '../email/email.service';
import { PrismaService } from '../prisma/prisma.service';

const memberInclude = {
  user: { select: { id: true, email: true, name: true, avatarUrl: true } },
} satisfies Prisma.CompanyMemberInclude;

const invitationInclude = {
  createdBy: { select: { id: true, name: true } },
} satisfies Prisma.CompanyInvitationInclude;

type MemberWithUser = Prisma.CompanyMemberGetPayload<{ include: typeof memberInclude }>;
type InvitationWithCreator = Prisma.CompanyInvitationGetPayload<{
  include: typeof invitationInclude;
}>;

/**
 * Tier 9.A — Team collaboration for companies.
 *
 * Owners and admins can invite users by email under a specific role
 * ({@link AssignableMemberRole}); invitees receive a token-bearing link
 * and accept after authenticating with the **same email address**. The
 * `OWNER` role is always reserved for `Company.ownerId` and cannot be
 * granted via this flow — there is exactly one owner per company.
 *
 * Tokens are 32 random bytes hex-encoded; only their SHA-256 hash is
 * persisted, mirroring the email-verification / password-reset pattern
 * elsewhere in this codebase. Tokens expire after
 * {@link INVITATION_TTL_DAYS} days and idle pending rows older than that
 * are flipped to `EXPIRED` lazily by {@link expirePending}.
 */
@Injectable()
export class TeamService {
  private readonly logger = new Logger(TeamService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
    private readonly config: ConfigService,
  ) {}

  // ---------------------------------------------------------------------------
  // Read
  // ---------------------------------------------------------------------------

  async getTeamForCompany(callerId: string): Promise<CompanyTeamDto> {
    const { company } = await this.requireMembership(callerId, ['OWNER', 'ADMIN', 'RECRUITER', 'VIEWER']);
    await this.expirePending(company.id);
    const [members, invitations] = await Promise.all([
      this.prisma.companyMember.findMany({
        where: { companyId: company.id },
        include: memberInclude,
        orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
      }),
      this.prisma.companyInvitation.findMany({
        where: { companyId: company.id, status: { in: ['PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED'] } },
        include: invitationInclude,
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    return {
      companyId: company.id,
      companyName: company.name,
      members: members.map((m) => this.toMemberDto(m)),
      invitations: invitations.map((i) => this.toInvitationDto(i)),
    };
  }

  // ---------------------------------------------------------------------------
  // Invitations
  // ---------------------------------------------------------------------------

  async createInvitation(
    callerId: string,
    body: CreateInvitationInput,
  ): Promise<CompanyInvitationDto> {
    const { company, callerRole } = await this.requireMembership(callerId, ['OWNER', 'ADMIN']);

    // Block invites that would shadow an existing member (whether owner or
    // through a previous accept) — the company would end up with two slots
    // for the same human and surprising role-resolution behavior.
    const existingMember = await this.prisma.companyMember.findFirst({
      where: { companyId: company.id, user: { email: body.email } },
      select: { id: true },
    });
    if (existingMember || company.owner.email.toLowerCase() === body.email) {
      throw new ConflictException('User is already a member of this company');
    }

    // Cap pending invitations to keep the audit trail (and the email
    // budget) bounded — admins can revoke stale ones to free a slot.
    const pendingCount = await this.prisma.companyInvitation.count({
      where: { companyId: company.id, status: 'PENDING' },
    });
    if (pendingCount >= MAX_PENDING_INVITATIONS_PER_COMPANY) {
      throw new ConflictException(
        `Pending invitations cap reached (${MAX_PENDING_INVITATIONS_PER_COMPANY}); revoke unused invites first`,
      );
    }

    // Refuse to leak a brand-new token over an existing pending invite —
    // surface it instead so the operator can resend it. This also stops
    // accidental double-invites from racing two valid tokens for the same
    // address.
    const samePending = await this.prisma.companyInvitation.findFirst({
      where: { companyId: company.id, email: body.email, status: 'PENDING' },
      include: invitationInclude,
    });
    if (samePending) {
      throw new ConflictException('A pending invitation already exists for this email');
    }

    if (callerRole !== 'OWNER' && body.role === 'ADMIN') {
      // Only owners can mint new admins; admins can invite recruiters /
      // viewers only. Mirrors the same restriction on `updateMemberRole`.
      throw new ForbiddenException('Only the company owner can grant the ADMIN role');
    }

    const token = randomBytes(32).toString('hex');
    const tokenHash = sha256(token);
    const expiresAt = new Date(Date.now() + INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000);

    const invitation = await this.prisma.companyInvitation.create({
      data: {
        companyId: company.id,
        email: body.email,
        role: body.role,
        tokenHash,
        expiresAt,
        createdById: callerId,
      },
      include: invitationInclude,
    });

    void this.sendInvitationEmail(invitation, token, company.name);
    return this.toInvitationDto(invitation);
  }

  async revokeInvitation(callerId: string, invitationId: string): Promise<CompanyInvitationDto> {
    const invitation = await this.prisma.companyInvitation.findUnique({
      where: { id: invitationId },
      include: invitationInclude,
    });
    if (!invitation) throw new NotFoundException('Invitation not found');
    const { callerRole } = await this.requireMembership(callerId, ['OWNER', 'ADMIN'], invitation.companyId);
    if (invitation.status !== 'PENDING') {
      throw new ConflictException(`Invitation is already ${invitation.status.toLowerCase()}`);
    }
    if (callerRole !== 'OWNER' && invitation.role === 'ADMIN') {
      // Defensive: if a previous owner had created an admin invite while
      // an admin tries to revoke it, fall back to owner-only authority.
      throw new ForbiddenException('Only the company owner can revoke an ADMIN invitation');
    }
    const updated = await this.prisma.companyInvitation.update({
      where: { id: invitation.id },
      data: { status: 'REVOKED', revokedAt: new Date(), revokedById: callerId },
      include: invitationInclude,
    });
    return this.toInvitationDto(updated);
  }

  /**
   * Read-only token introspection used by the accept page so a logged-in
   * user can review the company / role before clicking "Accept". We never
   * expose the raw email-mismatch error here — UX surfaces it as an
   * informational banner — but the actual `accept()` call enforces it.
   */
  async previewInvitation(callerId: string, token: string): Promise<InvitationPreviewDto> {
    const tokenHash = sha256(token);
    const invitation = await this.prisma.companyInvitation.findUnique({
      where: { tokenHash },
      include: { company: { select: { name: true } }, createdBy: { select: { name: true } } },
    });
    if (!invitation) throw new NotFoundException('Invitation not found');

    let status = invitation.status;
    if (status === 'PENDING' && invitation.expiresAt < new Date()) {
      status = 'EXPIRED';
      await this.prisma.companyInvitation
        .update({ where: { id: invitation.id }, data: { status: 'EXPIRED' } })
        .catch(() => undefined);
    }

    const caller = await this.prisma.user.findUnique({
      where: { id: callerId },
      select: { email: true },
    });
    return {
      email: invitation.email,
      role: invitation.role,
      status,
      companyName: invitation.company.name,
      inviterName: invitation.createdBy.name ?? null,
      expiresAt: invitation.expiresAt.toISOString(),
      emailMatchesViewer: !!caller && caller.email.toLowerCase() === invitation.email,
    };
  }

  /**
   * Atomically consume the invitation and create the matching
   * `CompanyMember` row. We require the authenticated caller's email to
   * match the invitation address (case-insensitive) so a stolen link
   * can't be redeemed by someone other than the intended invitee.
   */
  async acceptInvitation(callerId: string, token: string): Promise<{ companyId: string; role: CompanyMemberRole }> {
    const tokenHash = sha256(token);
    const caller = await this.prisma.user.findUnique({
      where: { id: callerId },
      select: { id: true, email: true },
    });
    if (!caller) throw new NotFoundException('User not found');

    return this.prisma.$transaction(async (tx) => {
      const invitation = await tx.companyInvitation.findUnique({ where: { tokenHash } });
      if (!invitation) throw new NotFoundException('Invitation not found');
      if (invitation.status !== 'PENDING') {
        throw new ConflictException(`Invitation is already ${invitation.status.toLowerCase()}`);
      }
      if (invitation.expiresAt < new Date()) {
        await tx.companyInvitation.update({
          where: { id: invitation.id },
          data: { status: 'EXPIRED' },
        });
        throw new ConflictException('Invitation has expired; ask the company to issue a new one');
      }
      if (caller.email.toLowerCase() !== invitation.email) {
        throw new ForbiddenException(
          'This invitation was issued to a different email address; sign in with that account to accept',
        );
      }

      // Refuse to seed a duplicate `CompanyMember` for the company owner
      // or any previously-accepted member.
      const company = await tx.company.findUniqueOrThrow({
        where: { id: invitation.companyId },
        select: { id: true, ownerId: true },
      });
      if (company.ownerId === caller.id) {
        await tx.companyInvitation.update({
          where: { id: invitation.id },
          data: { status: 'ACCEPTED', acceptedAt: new Date(), acceptedById: caller.id },
        });
        return { companyId: company.id, role: 'OWNER' as const };
      }
      const existing = await tx.companyMember.findUnique({
        where: { companyId_userId: { companyId: company.id, userId: caller.id } },
      });
      if (existing) {
        throw new ConflictException('You are already a member of this company');
      }

      await tx.companyMember.create({
        data: { companyId: company.id, userId: caller.id, role: invitation.role },
      });
      await tx.companyInvitation.update({
        where: { id: invitation.id },
        data: { status: 'ACCEPTED', acceptedAt: new Date(), acceptedById: caller.id },
      });
      return { companyId: company.id, role: invitation.role };
    });
  }

  // ---------------------------------------------------------------------------
  // Member management
  // ---------------------------------------------------------------------------

  async updateMemberRole(
    callerId: string,
    memberId: string,
    body: UpdateMemberRoleInput,
  ): Promise<CompanyMemberDto> {
    const member = await this.prisma.companyMember.findUnique({
      where: { id: memberId },
      include: memberInclude,
    });
    if (!member) throw new NotFoundException('Member not found');
    const { callerRole } = await this.requireMembership(callerId, ['OWNER', 'ADMIN'], member.companyId);

    if (member.role === 'OWNER') {
      throw new ForbiddenException('The company owner role cannot be changed');
    }
    if (member.userId === callerId) {
      throw new ForbiddenException('You cannot change your own role; ask another admin or the owner');
    }
    if (callerRole !== 'OWNER' && (member.role === 'ADMIN' || body.role === 'ADMIN')) {
      throw new ForbiddenException('Only the company owner can grant or revoke the ADMIN role');
    }

    const updated = await this.prisma.companyMember.update({
      where: { id: member.id },
      data: { role: body.role },
      include: memberInclude,
    });
    return this.toMemberDto(updated);
  }

  async removeMember(callerId: string, memberId: string): Promise<void> {
    const member = await this.prisma.companyMember.findUnique({
      where: { id: memberId },
      include: memberInclude,
    });
    if (!member) throw new NotFoundException('Member not found');
    const { callerRole } = await this.requireMembership(callerId, ['OWNER', 'ADMIN'], member.companyId);
    if (member.role === 'OWNER') {
      throw new ForbiddenException('The company owner cannot be removed');
    }
    if (member.userId === callerId) {
      throw new ForbiddenException('You cannot remove yourself; ask another admin or the owner');
    }
    if (callerRole !== 'OWNER' && member.role === 'ADMIN') {
      throw new ForbiddenException('Only the company owner can remove an admin');
    }
    await this.prisma.companyMember.delete({ where: { id: member.id } });
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /**
   * Resolve the caller's effective role on a company. Owners are mapped
   * to a synthetic `OWNER` row even though they don't have a
   * `CompanyMember` record. If `companyId` is omitted we look up the
   * caller's own (owned) company, which is the entry point for the
   * settings UI.
   */
  private async requireMembership(
    callerId: string,
    allowed: CompanyMemberRole[],
    companyId?: string,
  ): Promise<{ company: { id: string; name: string; ownerId: string; owner: { email: string } }; callerRole: CompanyMemberRole }> {
    const company = companyId
      ? await this.prisma.company.findUnique({
          where: { id: companyId },
          select: { id: true, name: true, ownerId: true, owner: { select: { email: true } } },
        })
      : await this.prisma.company.findUnique({
          where: { ownerId: callerId },
          select: { id: true, name: true, ownerId: true, owner: { select: { email: true } } },
        });
    if (!company) {
      throw new NotFoundException(companyId ? 'Company not found' : 'You do not own a company');
    }

    let role: CompanyMemberRole;
    if (company.ownerId === callerId) {
      role = 'OWNER';
    } else {
      const member = await this.prisma.companyMember.findUnique({
        where: { companyId_userId: { companyId: company.id, userId: callerId } },
        select: { role: true },
      });
      if (!member) throw new ForbiddenException('You are not a member of this company');
      role = member.role;
    }

    if (!allowed.includes(role)) {
      throw new ForbiddenException(`Requires role: ${allowed.join(', ')}`);
    }
    return { company, callerRole: role };
  }

  /** Lazily mark long-stale `PENDING` rows as `EXPIRED` so the listing
   *  page accurately reflects what's still actionable. */
  private async expirePending(companyId: string): Promise<void> {
    await this.prisma.companyInvitation.updateMany({
      where: { companyId, status: 'PENDING', expiresAt: { lt: new Date() } },
      data: { status: 'EXPIRED' },
    });
  }

  private async sendInvitationEmail(
    invitation: InvitationWithCreator,
    plaintextToken: string,
    companyName: string,
  ): Promise<void> {
    try {
      const url = this.buildAppUrl(`/en/invitations/${encodeURIComponent(plaintextToken)}`);
      const inviter = invitation.createdBy.name ?? 'A teammate';
      const subject = `You're invited to join ${companyName} on Trainova AI`;
      const html = `
        <h1 style="font:600 20px system-ui">You're invited to ${escapeHtml(companyName)}</h1>
        <p style="font:400 14px system-ui;color:#475569">${escapeHtml(inviter)} invited you to join their team as <strong>${invitation.role}</strong>.</p>
        <p style="font:400 14px system-ui;color:#475569">The invitation expires on ${invitation.expiresAt.toUTCString()}.</p>
        <p style="margin:24px 0"><a href="${url}" style="display:inline-block;padding:10px 16px;background:#0f172a;color:#fff;border-radius:6px;text-decoration:none">Review invitation</a></p>
        <p style="font:400 12px system-ui;color:#94a3b8">If the button doesn't work, copy and paste this link:<br/>${url}</p>
      `;
      await this.email.sendRaw(invitation.email, subject, html);
    } catch (err) {
      this.logger.warn(
        `Failed to send invitation email to ${invitation.email} for company ${invitation.companyId}: ${(err as Error).message}`,
      );
    }
  }

  private buildAppUrl(path: string): string {
    const base =
      this.config.get<string>('NEXT_PUBLIC_SITE_URL') ??
      this.config.get<string>('APP_URL') ??
      'http://localhost:3000';
    return `${base.replace(/\/+$/, '')}${path.startsWith('/') ? path : `/${path}`}`;
  }

  private toMemberDto(member: MemberWithUser): CompanyMemberDto {
    return {
      id: member.id,
      userId: member.user.id,
      email: member.user.email,
      name: member.user.name,
      avatarUrl: member.user.avatarUrl,
      role: member.role,
      createdAt: member.createdAt.toISOString(),
      updatedAt: member.updatedAt.toISOString(),
    };
  }

  private toInvitationDto(invitation: InvitationWithCreator): CompanyInvitationDto {
    return {
      id: invitation.id,
      email: invitation.email,
      role: invitation.role,
      status: invitation.status,
      expiresAt: invitation.expiresAt.toISOString(),
      createdAt: invitation.createdAt.toISOString(),
      acceptedAt: invitation.acceptedAt ? invitation.acceptedAt.toISOString() : null,
      revokedAt: invitation.revokedAt ? invitation.revokedAt.toISOString() : null,
      createdBy: invitation.createdBy
        ? { id: invitation.createdBy.id, name: invitation.createdBy.name ?? null }
        : null,
    };
  }
}

function sha256(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
