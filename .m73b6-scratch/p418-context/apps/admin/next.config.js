/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@scs/ui-kit', '@scs/contracts', '@scs/env'],
  output: 'standalone',
};

module.exports = nextConfig;
