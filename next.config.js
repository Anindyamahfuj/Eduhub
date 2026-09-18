/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['hono'],
  },
};

module.exports = nextConfig;
