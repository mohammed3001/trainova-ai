import type { Metadata } from 'next';
import { siteUrl } from '@/lib/seo';
import './globals.css';

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
