// lib/auth.js
// Clerk JWT verification helper for Vercel API routes

import { createClerkClient } from '@clerk/backend'

const clerk = createClerkClient({
  secretKey: process.env.CLERK_SECRET_KEY,
})

/**
 * Extracts and verifies the Clerk JWT from the Authorization header.
 * Returns the Clerk userId on success, throws on failure.
 *
 * Usage in an API route:
 *   const userId = await requireAuth(req)
 */
export async function requireAuth(req) {
  const authHeader = req.headers.authorization || req.headers.Authorization
  if (!authHeader?.startsWith('Bearer ')) {
    const err = new Error('Missing or invalid Authorization header')
    err.status = 401
    throw err
  }

  const token = authHeader.slice(7)

  try {
    const { sub } = await clerk.verifyToken(token, {
      authorizedParties: [process.env.NEXT_PUBLIC_APP_URL || 'https://swiftsreader.com'],
    })
    return sub // Clerk userId, e.g. "user_2abc..."
  } catch {
    const err = new Error('Invalid or expired token')
    err.status = 401
    throw err
  }
}

/**
 * Sends a standardised error response.
 */
export function sendError(res, status, message) {
  return res.status(status).json({ error: message })
}
