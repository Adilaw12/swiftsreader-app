// app/app/route.ts
// GET /app — serves public/app.html (the SwiftsReader reader)

import { readFile } from 'fs/promises'
import { join } from 'path'
import { NextResponse } from 'next/server'

export async function GET() {
  const html = await readFile(join(process.cwd(), 'public', 'app.html'), 'utf8')
  return new NextResponse(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
}
