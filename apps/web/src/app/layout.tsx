import type { Metadata, Viewport } from 'next';
import { siteUrl } from '@/lib/seo';
import './globals.css';

/**
 * T9.O — Mobile responsive + Lighthouse pass.
 *
 * Explicit viewport export so Next.js emits a `<meta name="viewport">`
 * with `width=device-width, initial-scale=1` on every page (Lighthouse
 * "Has a `<meta name="viewport">` tag" audit), and a brand `theme-color`
 * so mobile browsers tint the address bar to match the header.
 */
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#2b3fd8' },
    { media: '(prefers-color-scheme: dark)', color: '#1f2a88' },
  ],
  colorScheme: 'light',
};

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: {
    default: 'Trainova AI — The Global Marketplace for AI Training Talent',
    template: '%s | Trainova AI',
  },
  description:
    'Hire, test and collaborate with elite AI trainers — tested on your actual model. Fine-tuning, RLHF, prompt engineering, evaluation, safety alignment and more.',
  applicationName: 'Trainova AI',
  authors: [{ name: 'Trainova AI' }],
  keywords: [
    'AI trainers',
    'fine-tuning experts',
    'prompt engineering',
    'RLHF',
    'data labeling',
    'LLM evaluation',
    'AI safety',
    'model training marketplace',
  ],
  creator: 'Trainova AI',
  publisher: 'Trainova AI',
  formatDetection: { email: false, address: false, telephone: false },
  icons: {
    icon: '/favicon.ico',
    apple: '/apple-touch-icon.png',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return children;
}
