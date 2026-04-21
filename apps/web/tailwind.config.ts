import type { Config } from 'tailwindcss';

export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-inter)', 'var(--font-arabic)', 'system-ui', 'sans-serif'],
        arabic: ['var(--font-arabic)', 'system-ui', 'sans-serif'],
      },
      colors: {
        brand: {
          50: '#eef4ff',
          100: '#dbe6ff',
          200: '#bccbff',
          300: '#8fa8ff',
          400: '#5e7dff',
          500: '#3a57f4',
          600: '#2b3fd8',
          700: '#2331ae',
          800: '#1f2a88',
          900: '#1e286b',
        },
        accent: {
          400: '#f6b93b',
          500: '#e58e26',
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
