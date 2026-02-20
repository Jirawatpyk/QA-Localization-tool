import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  serverExternalPackages: ['pino'],
  cacheComponents: true,
}

export default nextConfig
