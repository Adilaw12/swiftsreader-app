// app/api/auth/me/route.ts
// GET /api/auth/me — returns current user profile
// GET /api/auth/me?config=1 — returns Clerk publishable key (no auth needed)

import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const url = new URL(req.url)

  // ── Config endpoint — no auth needed ─────────────────────────────────────
  if (url.searchParams.get('config') === '1') {
    return NextResponse.json({
      publishableKey: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || ''
    })
  }

  // ── Auth ──────────────────────────────────────────────────────────────────
  let userId: string | null = null
  try {
    const { auth } = await import('@clerk/nextjs/server')
    const session = await auth()
    userId = session?.userId ?? null
  } catch (e) {
    console.warn('[/api/auth/me] Clerk unavailable:', e)
  }

  if (!userId) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  // ── User profile from DB ──────────────────────────────────────────────────
  try {
    const { prisma } = await import('@/lib/prisma')
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id:                   true,
        email:                true,
        tier:                 true,
        summariesUsed:        true,
        summariesLimit:       true,
        ttsCharsUsed:         true,
        ttsCharsLimit:        true,
        stripeSubscriptionId: true,
        _count: { select: { papers: true } },
      },
    })

    if (!user) {
      // User signed in with Clerk but not in DB yet — return basic profile
      return NextResponse.json({
        id:    userId,
        email: '',
        tier:  'free',
        summariesUsed:  0,
        summariesLimit: 10,
        ttsCharsUsed:   0,
        ttsCharsLimit:  0,
        paperCount:     0,
        subscribed:     false,
      })
    }

    return NextResponse.json({
      id:             user.id,
      email:          user.email,
      tier:           user.tier.toLowerCase(),
      summariesUsed:  user.summariesUsed,
      summariesLimit: user.summariesLimit,
      ttsCharsUsed:   user.ttsCharsUsed,
      ttsCharsLimit:  user.ttsCharsLimit,
      paperCount:     user._count.papers,
      subscribed:     !!user.stripeSubscriptionId,
    })
  } catch (err) {
    console.error('[GET /api/auth/me]', err)
    // DB error — return basic profile so app still works
    return NextResponse.json({
      id:    userId,
      email: '',
      tier:  'free',
      summariesUsed:  0,
      summariesLimit: 10,
      ttsCharsUsed:   0,
      ttsCharsLimit:  0,
      paperCount:     0,
      subscribed:     false,
    })
  }
}
