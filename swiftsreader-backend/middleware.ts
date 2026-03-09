import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Minimal middleware — no Clerk dependency
// Each API route handles its own auth via auth() directly
export function middleware(req: NextRequest) {
  return NextResponse.next()
}

export const config = {
  matcher: ['/(api|trpc)(.*)'],
}
