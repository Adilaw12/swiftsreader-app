// middleware.ts
// Clerk auth middleware — runs on Edge Runtime.
// Only intercepts API routes and Next.js pages; static files are excluded.

import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'

const isPublicRoute = createRouteMatcher([
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/api/webhooks/(.*)',   // Stripe + Clerk webhooks must be public
])

export default clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) {
    await auth.protect()
  }
})

export const config = {
  matcher: [
    // Only run middleware on API routes and Next.js page routes.
    // Excludes: static files, _next internals, and anything with a file extension.
    '/(api|trpc)(.*)',
    '/((?!_next/static|_next/image|favicon\\.ico|.*\\..*).*)',
  ],
}
