import { redirect } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { ADMIN_ROLE_GROUPS, EmailDripTriggers } from '@trainova/shared';
import { getRole, getToken } from '@/lib/session';
import { createDripSequenceAction } from '../../actions';

export default async function NewDripSequencePage() {
  const t = await getTranslations();
  const locale = await getLocale();
  const [token, role] = await Promise.all([getToken(), getRole()]);
  if (!token) redirect(`/${locale}/login`);
  if (!(ADMIN_ROLE_GROUPS.CONTENT as readonly string[]).includes(role ?? '')) {
    redirect(`/${locale}`);
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold text-slate-900">
          {t('admin.emailMarketing.drip.new')}
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          {t('admin.emailMarketing.drip.newSubtitle')}
        </p>
      </header>

      <form
        action={async (fd) => {
          'use server';
          await createDripSequenceAction(fd);
        }}
        className="card grid gap-4 bg-white/70 sm:grid-cols-2"
      >
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-600 sm:col-span-2">
          {t('admin.emailMarketing.drip.fields.name')}
          <input name="name" required className="input" maxLength={160} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
          {t('admin.emailMarketing.drip.fields.slug')}
          <input
            name="slug"
            required
            className="input"
            maxLength={80}
            pattern="[a-z0-9][a-z0-9-]*[a-z0-9]"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
          {t('admin.emailMarketing.drip.fields.trigger')}
          <select name="trigger" defaultValue="MANUAL" className="input">
            {EmailDripTriggers.map((tr) => (
              <option key={tr} value={tr}>
                {t(`admin.emailMarketing.drip.trigger.${tr}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input type="checkbox" name="enabled" value="true" defaultChecked />
          {t('admin.emailMarketing.drip.fields.enabled')}
        </label>
        <div className="sm:col-span-2 flex justify-end">
          <button type="submit" className="btn-primary">
            {t('admin.emailMarketing.create')}
          </button>
        </div>
      </form>
    </div>
  );
}
