import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'Trainova AI — The Global Marketplace for AI Training Talent',
    template: '%s | Trainova AI',
  },
  description:
    'Hire, test and collaborate with elite AI trainers — tested on your actual model. Fine-tuning, RLHF, prompt engineering, evaluation, safety alignment and more.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return children;
}
