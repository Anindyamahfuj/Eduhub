/** @type {import('next').NextConfig} */
const nextConfig = {
  // Ensure API routes can use Node.js features
  experimental: {
    serverComponentsExternalPackages: ['hono'],
  },
};

module.exports = nextConfig;
