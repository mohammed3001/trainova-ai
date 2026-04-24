import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { buildMetadata } from '@/lib/seo';
import type { Locale } from '@/i18n/config';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'seo.about' });
  return buildMetadata({
    title: t('title'),
    description: t('description'),
    path: '/about',
    locale: locale as Locale,
  });
}

export default function AboutPage() {
  return (
    <article className="prose prose-slate mx-auto max-w-3xl">
      <h1>About Trainova AI</h1>
      <p>
        Trainova AI is the global marketplace and evaluation platform for AI training talent. Companies post
        training requests and link their actual models or sandboxes. Verified AI trainers apply, are tested
        on the real problem, and matched by our platform for hiring, collaboration and payment — end to end.
      </p>
      <h2>Why we exist</h2>
      <p>
        Generic freelance marketplaces cannot verify whether a trainer can actually fine-tune your model,
        ship an RLHF pipeline, or harden your agent against jailbreaks. Trainova AI fixes that with
        model-linked evaluation: every hire is backed by a real, measurable test on your stack.
      </p>
    </article>
  );
}
