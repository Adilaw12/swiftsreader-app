// middleware.ts
// Clerk auth middleware — only protects API routes.
// The SwiftsReader app (public/app.html) handles its own auth state client-side.

import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'

// API routes that require a valid Clerk session
const isProtectedApi = createRouteMatcher([
  '/api/auth(.*)',
  '/api/tts(.*)',
  '/api/library(.*)',
  '/api/summary(.*)',
  '/api/checkout(.*)',
  '/api/sessions(.*)',
])

export default clerkMiddleware(async (auth, req) => {
  if (isProtectedApi(req)) {
    await auth.protect()
  }
  // Everything else (pages, static files, webhooks) passes through freely
})

export const config = {
  matcher: [
    // Only run on API routes — skip all static files and page routes
    '/(api|trpc)(.*)',
  ],
}
