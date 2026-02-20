import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  serverExternalPackages: ['pino'],
  experimental: {
    cacheComponents: true,
  },
}

export default nextConfig
