// app/route.ts
// GET / — serves public/landing.html (marketing landing page)

import { readFile } from 'fs/promises'
import { join } from 'path'
import { NextResponse } from 'next/server'

export async function GET() {
  const html = await readFile(join(process.cwd(), 'public', 'landing.html'), 'utf8')
  return new NextResponse(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
}
