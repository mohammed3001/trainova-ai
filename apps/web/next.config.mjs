import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@trainova/shared'],
  images: {
    remotePatterns: [{ protocol: 'https', hostname: '**' }],
  },
};

export default withNextIntl(nextConfig);
