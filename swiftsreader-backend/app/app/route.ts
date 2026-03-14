// app/app/route.ts
// GET /app — serves public/app.html with Clerk publishable key injected

import { readFile } from 'fs/promises'
import { join } from 'path'
import { NextResponse } from 'next/server'

export async function GET() {
  let html = await readFile(join(process.cwd(), 'public', 'app.html'), 'utf8')

  // Inject the publishable key directly into the HTML so Clerk
  // can load correctly without a dynamic fetch.
  // The publishable key is safe to expose in frontend HTML.
  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || ''

  if (publishableKey) {
    // Inject a global variable before </head> so Clerk can find it immediately
    const injection = `  <script>window.__CLERK_PUBLISHABLE_KEY__ = "${publishableKey}";</script>`
    html = html.replace('</head>', injection + '\n</head>')
  }

  return new NextResponse(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store, no-cache, must-revalidate' },
  })
}
