import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'

const isProtectedApi = createRouteMatcher([
  '/api/auth(.*)',
  '/api/tts(.*)',
  '/api/library(.*)',
  '/api/summary(.*)',
  '/api/checkout(.*)',
  '/api/sessions(.*)',
])

export default clerkMiddleware(async (auth, req) => {
  try {
    if (isProtectedApi(req)) {
      await auth.protect()
    }
    return NextResponse.next()
  } catch (e) {
    // Don't crash the middleware — just pass through
    return NextResponse.next()
  }
})

export const config = {
  matcher: ['/(api|trpc)(.*)'],
}
