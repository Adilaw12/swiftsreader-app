// lib/auth.ts
// Thin wrapper around Clerk's auth() for use in App Router route handlers.
// Returns the userId or throws a typed error.

import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'

/**
 * Returns the authenticated Clerk userId.
 * If unauthenticated, returns a 401 NextResponse instead.
 *
 * Usage in a route handler:
 *
 *   const result = await getAuthUserId()
 *   if (result instanceof NextResponse) return result   // early exit = 401
 *   const userId = result
 */
export async function getAuthUserId(): Promise<string | NextResponse> {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }
  return userId
}

/**
 * Standard error response helper.
 */
export function apiError(message: string, status = 500) {
  return NextResponse.json({ error: message }, { status })
}
