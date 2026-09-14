/** @type {import('next').NextConfig} */
const nextConfig = {
  // Serve the original frontend as static files
  output: 'standalone',
  
  // Ensure API routes can use Node.js features
  experimental: {
    serverComponentsExternalPackages: ['hono'],
  },
  
  //Rewrite API calls to our catch-all handler
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: '/api/:path*',
      },
    ];
  },
  
  // Headers for API routes
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          { key: 'Cache-Control', value: 'no-store' },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
