// middleware.ts  (project root)
// Protects all routes — public routes listed in matcher exclusions

import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'

const isPublicRoute = createRouteMatcher([
  '/',
  '/app.html',            // SwiftsReader app — handles its own auth state
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
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
}
