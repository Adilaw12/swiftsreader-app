import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Prisma client must run in Node.js runtime, not Edge
  serverExternalPackages: ['@prisma/client', 'prisma'],
}

export default nextConfig
