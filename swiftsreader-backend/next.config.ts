import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Keep Prisma in Node.js runtime — never run in Edge
  serverExternalPackages: ['@prisma/client', 'prisma'],
}

export default nextConfig
