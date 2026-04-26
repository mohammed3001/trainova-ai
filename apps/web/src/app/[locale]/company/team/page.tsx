import { redirect } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { getRole, getToken } from '@/lib/session';
import { authedFetch } from '@/lib/authed-fetch';
import type { CompanyTeamDto } from '@trainova/shared';
import { TeamClient } from './team-client';

interface MeUser {
  id: string;
  email: string;
}

export default async function CompanyTeamPage() {
  const t = await getTranslations();
  const locale = await getLocale();
  const [token, role] = await Promise.all([getToken(), getRole()]);
  if (!token) redirect(`/${locale}/login`);
  if (role !== 'COMPANY_OWNER' && role !== 'COMPANY_MEMBER') redirect(`/${locale}`);

  const [team, me] = await Promise.all([
    authedFetch<CompanyTeamDto>('/team/me'),
    authedFetch<MeUser>('/auth/me'),
  ]);

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-3xl font-bold text-slate-900">{t('company.team.title')}</h1>
        <p className="text-sm text-slate-500">{t('company.team.subtitle', { company: team.companyName })}</p>
      </header>

      <TeamClient initialTeam={team} viewerUserId={me.id} viewerEmail={me.email} />
    </div>
  );
}
