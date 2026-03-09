// app/api/auth/me/route.ts
// GET /api/auth/me — returns current user profile and usage stats

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getAuthUserId, apiError } from '@/lib/auth'

export async function GET() {
  const result = await getAuthUserId()
  if (result instanceof NextResponse) return result
  const userId = result

  try {
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
        createdAt:            true,
        _count: { select: { papers: true } },
      },
    })

    if (!user) return apiError('User not found', 404)

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
    return apiError('Internal server error')
  }
}
