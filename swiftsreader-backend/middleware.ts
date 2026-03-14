import { clerkMiddleware } from '@clerk/nextjs/server'

// Clerk middleware — sets session cookies automatically.
// Each API route handles its own auth() checks.
// All routes are public by default — no forced sign-in.
export default clerkMiddleware()

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
}
