// app/route.ts
// GET / — serves public/app.html as raw HTML.
// A Route Handler at the app root takes precedence over page.tsx
// and avoids rewrite/redirect issues with static files.

import { readFile } from 'fs/promises'
import { join } from 'path'
import { NextResponse } from 'next/server'

export async function GET() {
  const html = await readFile(join(process.cwd(), 'public', 'app.html'), 'utf8')
  return new NextResponse(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
}
