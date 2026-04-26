'use client';

import { useMemo, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import type {
  AssignableMemberRole,
  CompanyInvitationDto,
  CompanyMemberDto,
  CompanyMemberRole,
  CompanyTeamDto,
} from '@trainova/shared';
import {
  inviteMember,
  removeMember,
  revokeInvitation,
  updateMemberRole,
} from '@/lib/team-api';

interface Props {
  initialTeam: CompanyTeamDto;
  viewerUserId: string;
  viewerEmail: string;
}

const ASSIGNABLE_ROLES: readonly AssignableMemberRole[] = ['ADMIN', 'RECRUITER', 'VIEWER'];

export function TeamClient({ initialTeam, viewerUserId, viewerEmail }: Props) {
  const t = useTranslations();
  const [team, setTeam] = useState(initialTeam);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Caller's effective role determines which actions are visible. We
  // resolve it from `members` if there's a row, otherwise infer OWNER
  // since the page-level guard already rejects non-members.
  const viewerRole: CompanyMemberRole = useMemo(() => {
    const member = team.members.find((m) => m.userId === viewerUserId);
    return member ? member.role : 'OWNER';
  }, [team.members, viewerUserId]);
  const canManage = viewerRole === 'OWNER' || viewerRole === 'ADMIN';

  const guard = (label: string, fn: () => Promise<void>) => {
    setError(null);
    startTransition(async () => {
      try {
        await fn();
      } catch (err) {
        const message = err instanceof Error ? err.message : `${label} failed`;
        setError(message);
      }
    });
  };

  const onInvite = (form: { email: string; role: AssignableMemberRole }) =>
    guard('Invitation', async () => {
      const created = await inviteMember(form);
      setTeam((current) => ({ ...current, invitations: [created, ...current.invitations] }));
    });

  const onRevoke = (id: string) =>
    guard('Revoke', async () => {
      const updated = await revokeInvitation(id);
      setTeam((current) => ({
        ...current,
        invitations: current.invitations.map((inv) => (inv.id === id ? updated : inv)),
      }));
    });

  const onChangeRole = (id: string, role: AssignableMemberRole) =>
    guard('Role update', async () => {
      const updated = await updateMemberRole(id, { role });
      setTeam((current) => ({
        ...current,
        members: current.members.map((m) => (m.id === id ? updated : m)),
      }));
    });

  const onRemove = (id: string) =>
    guard('Remove', async () => {
      await removeMember(id);
      setTeam((current) => ({
        ...current,
        members: current.members.filter((m) => m.id !== id),
      }));
    });

  return (
    <div className="space-y-10">
      {error ? (
        <div className="card border-rose-200 bg-rose-50 text-sm text-rose-700">{error}</div>
      ) : null}

      {canManage ? <InviteForm onSubmit={onInvite} disabled={pending} /> : null}

      <MembersTable
        members={team.members}
        viewerUserId={viewerUserId}
        canManage={canManage}
        viewerRole={viewerRole}
        onChangeRole={onChangeRole}
        onRemove={onRemove}
        disabled={pending}
      />

      <InvitationsList
        invitations={team.invitations}
        viewerEmail={viewerEmail}
        canManage={canManage}
        viewerRole={viewerRole}
        onRevoke={onRevoke}
        disabled={pending}
      />

      <p className="text-xs text-slate-400">{t('company.team.helpFooter')}</p>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Invite form
// -----------------------------------------------------------------------------

function InviteForm({
  onSubmit,
  disabled,
}: {
  onSubmit: (body: { email: string; role: AssignableMemberRole }) => void;
  disabled: boolean;
}) {
  const t = useTranslations();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<AssignableMemberRole>('RECRUITER');

  return (
    <section className="card">
      <h2 className="text-lg font-semibold text-slate-900">{t('company.team.inviteTitle')}</h2>
      <p className="mt-1 text-sm text-slate-500">{t('company.team.inviteHelp')}</p>
      <form
        className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-[1fr_180px_auto]"
        onSubmit={(e) => {
          e.preventDefault();
          if (!email.trim()) return;
          onSubmit({ email: email.trim().toLowerCase(), role });
          setEmail('');
        }}
      >
        <label className="flex flex-col text-sm">
          <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
            {t('company.team.email')}
          </span>
          <input
            type="email"
            value={email}
            required
            onChange={(e) => setEmail(e.target.value)}
            className="input"
            placeholder="teammate@example.com"
          />
        </label>
        <label className="flex flex-col text-sm">
          <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
            {t('company.team.role')}
          </span>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as AssignableMemberRole)}
            className="input"
          >
            {ASSIGNABLE_ROLES.map((r) => (
              <option key={r} value={r}>
                {t(`company.team.roles.${r}`)}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="btn-primary self-end" disabled={disabled}>
          {t('company.team.sendInvite')}
        </button>
      </form>
    </section>
  );
}

// -----------------------------------------------------------------------------
// Members table
// -----------------------------------------------------------------------------

function MembersTable({
  members,
  viewerUserId,
  canManage,
  viewerRole,
  onChangeRole,
  onRemove,
  disabled,
}: {
  members: CompanyMemberDto[];
  viewerUserId: string;
  canManage: boolean;
  viewerRole: CompanyMemberRole;
  onChangeRole: (id: string, role: AssignableMemberRole) => void;
  onRemove: (id: string) => void;
  disabled: boolean;
}) {
  const t = useTranslations();
  return (
    <section>
      <h2 className="mb-3 text-lg font-semibold text-slate-900">
        {t('company.team.members')} ({members.length})
      </h2>
      {members.length === 0 ? (
        <div className="card text-sm text-slate-500">{t('company.team.empty')}</div>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">{t('company.team.name')}</th>
                <th className="px-4 py-3">{t('company.team.email')}</th>
                <th className="px-4 py-3">{t('company.team.role')}</th>
                <th className="px-4 py-3 text-end">{t('company.team.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {members.map((m) => {
                const isSelf = m.userId === viewerUserId;
                const isOwner = m.role === 'OWNER';
                // Admins cannot edit other admins; only the owner can.
                const canEditThis =
                  canManage && !isSelf && !isOwner && (viewerRole === 'OWNER' || m.role !== 'ADMIN');
                return (
                  <tr key={m.id}>
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {m.name ?? '—'}
                      {isSelf ? (
                        <span className="ms-2 text-xs font-normal text-slate-400">
                          ({t('company.team.you')})
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{m.email}</td>
                    <td className="px-4 py-3">
                      {canEditThis ? (
                        <select
                          value={m.role === 'OWNER' ? 'ADMIN' : m.role}
                          onChange={(e) =>
                            onChangeRole(m.id, e.target.value as AssignableMemberRole)
                          }
                          className="input"
                          disabled={disabled}
                        >
                          {ASSIGNABLE_ROLES.map((r) => (
                            <option key={r} value={r}>
                              {t(`company.team.roles.${r}`)}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="badge">{t(`company.team.roles.${m.role}`)}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-end">
                      {canEditThis ? (
                        <button
                          type="button"
                          className="btn-link text-rose-600 hover:text-rose-800"
                          onClick={() => onRemove(m.id)}
                          disabled={disabled}
                        >
                          {t('company.team.remove')}
                        </button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// -----------------------------------------------------------------------------
// Invitations list
// -----------------------------------------------------------------------------

function InvitationsList({
  invitations,
  viewerEmail,
  canManage,
  viewerRole,
  onRevoke,
  disabled,
}: {
  invitations: CompanyInvitationDto[];
  viewerEmail: string;
  canManage: boolean;
  viewerRole: CompanyMemberRole;
  onRevoke: (id: string) => void;
  disabled: boolean;
}) {
  const t = useTranslations();
  if (invitations.length === 0) {
    return (
      <section>
        <h2 className="mb-3 text-lg font-semibold text-slate-900">{t('company.team.invitations')}</h2>
        <div className="card text-sm text-slate-500">{t('company.team.noInvitations')}</div>
      </section>
    );
  }
  return (
    <section>
      <h2 className="mb-3 text-lg font-semibold text-slate-900">
        {t('company.team.invitations')} ({invitations.length})
      </h2>
      <ul className="space-y-2">
        {invitations.map((inv) => {
          const canRevoke =
            canManage &&
            inv.status === 'PENDING' &&
            (viewerRole === 'OWNER' || inv.role !== 'ADMIN') &&
            inv.email !== viewerEmail;
          return (
            <li key={inv.id} className="card flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="font-medium text-slate-900">{inv.email}</div>
                <div className="text-xs text-slate-500">
                  {t(`company.team.roles.${inv.role}`)} ·{' '}
                  <span data-status={inv.status} className={statusClass(inv.status)}>
                    {t(`company.team.statuses.${inv.status}`)}
                  </span>{' '}
                  · {t('company.team.expiresAt', { date: new Date(inv.expiresAt).toLocaleDateString() })}
                </div>
              </div>
              {canRevoke ? (
                <button
                  type="button"
                  className="btn-link text-rose-600 hover:text-rose-800"
                  onClick={() => onRevoke(inv.id)}
                  disabled={disabled}
                >
                  {t('company.team.revoke')}
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function statusClass(status: CompanyInvitationDto['status']): string {
  switch (status) {
    case 'PENDING':
      return 'text-amber-700';
    case 'ACCEPTED':
      return 'text-emerald-700';
    case 'REVOKED':
      return 'text-slate-500';
    case 'EXPIRED':
    default:
      return 'text-rose-700';
  }
}
