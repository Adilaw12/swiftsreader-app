import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Keep Prisma in Node.js runtime — never run in Edge
  serverExternalPackages: ['@prisma/client', 'prisma'],

  async rewrites() {
    return [
      // Serve the SwiftsReader app at the root URL
      { source: '/', destination: '/app.html' },
    ]
  },
}

export default nextConfig
