import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { apiFetch } from '@/lib/api';
import { buildMetadata } from '@/lib/seo';
import type { Locale } from '@/i18n/config';

interface CertificatePayload {
  valid: boolean;
  serial: string;
  issuedAt: string;
  learnerName: string | null;
  pathTitle: string;
  pathSlug: string;
  pathLevel: 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED';
}

export const revalidate = 60;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; serial: string }>;
}): Promise<Metadata> {
  const { locale, serial } = await params;
  const t = await getTranslations({ locale, namespace: 'learning.certificate' });
  return buildMetadata({
    title: t('title'),
    description: t('verifyTitle'),
    path: `/certificates/${serial}`,
    locale: locale as Locale,
  });
}

export default async function CertificateVerifyPage({
  params,
}: {
  params: Promise<{ locale: string; serial: string }>;
}) {
  const { locale, serial } = await params;
  const t = await getTranslations({ locale, namespace: 'learning' });

  let cert: CertificatePayload;
  try {
    cert = await apiFetch<CertificatePayload>(`/learning-paths/certificates/${serial}`);
  } catch {
    notFound();
  }

  const issued = new Date(cert.issuedAt).toLocaleDateString(locale);

  return (
    <div className="mx-auto max-w-2xl px-4 py-16">
      <div className="rounded-3xl border-2 border-brand-200 bg-white p-10 shadow-lg">
        <p className="text-xs font-medium uppercase tracking-widest text-brand-600">
          Trainova AI
        </p>
        <h1 className="mt-2 text-3xl font-bold text-slate-900">
          {t('certificate.title')}
        </h1>
        <div className="mt-8 space-y-3 text-slate-700">
          <p>
            <span className="text-xs uppercase tracking-wider text-slate-500">
              {t('certificate.learner')}
            </span>
            <br />
            <span className="text-lg font-semibold text-slate-900">
              {cert.learnerName ?? '—'}
            </span>
          </p>
          <p>
            <span className="text-xs uppercase tracking-wider text-slate-500">
              {t('certificate.path')}
            </span>
            <br />
            <span className="font-medium">
              {cert.pathTitle}{' '}
              <span className="text-xs text-slate-500">
                ({t(`level.${cert.pathLevel}`)})
              </span>
            </span>
          </p>
          <p className="grid grid-cols-2 gap-4 pt-2 text-sm">
            <span>
              <span className="text-xs uppercase tracking-wider text-slate-500">
                {t('certificate.serial')}
              </span>
              <br />
              <span className="break-all font-mono">{cert.serial}</span>
            </span>
            <span>
              <span className="text-xs uppercase tracking-wider text-slate-500">
                {t('certificate.issued')}
              </span>
              <br />
              <span>{issued}</span>
            </span>
          </p>
        </div>
        <div
          className={`mt-8 rounded-lg p-3 text-sm font-medium ${
            cert.valid
              ? 'bg-emerald-50 text-emerald-700'
              : 'bg-red-50 text-red-700'
          }`}
        >
          {cert.valid ? t('certificate.valid') : t('certificate.invalid')}
        </div>
      </div>
    </div>
  );
}
