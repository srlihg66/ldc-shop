import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  // Temporary: enable source maps to locate the component causing React #310.
  // Remove after debugging to avoid exposing source in production.
  productionBrowserSourceMaps: true,
  async rewrites() {
    return [
      {
        source: '/authcallback',
        destination: '/api/auth/callback/linuxdo',
      },
      {
        source: '/favicon.ico',
        destination: '/icon.svg',
      },
    ]
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
