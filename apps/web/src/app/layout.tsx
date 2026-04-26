import type { Metadata, Viewport } from 'next';
import { siteUrl } from '@/lib/seo';
import './globals.css';

export const viewport: Viewport = {
  // Polish pass — explicit mobile-first viewport so iOS Safari + small
  // Android viewports render at the design width instead of zooming
  // out to a desktop fallback. Lighthouse mobile audit also hard-fails
  // without this. `themeColor` is split per color scheme to match the
  // light/dark `<html>` palette.
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f8fafc' },
    { media: '(prefers-color-scheme: dark)', color: '#0f172a' },
  ],
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
