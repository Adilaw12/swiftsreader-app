// app/api/tts/route.ts
// POST /api/tts — converts text to audio using OpenAI TTS
// Works with or without DB/auth (graceful fallback for early deployment)

import { NextRequest, NextResponse } from 'next/server'

const OPENAI_TTS_URL = 'https://api.openai.com/v1/audio/speech'
const DEFAULT_VOICE  = 'nova'
const MAX_CHARS      = 4096

function apiError(message: string, status = 500) {
  return NextResponse.json({ error: message }, { status })
}

function clampSpeed(speed?: number): number {
  if (!speed) return 1.0
  return Math.min(4.0, Math.max(0.25, speed))
}

export async function POST(req: NextRequest) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return apiError('HD Voice not configured', 503)
    }

    const body = await req.json()
    const { text, voice = DEFAULT_VOICE, speed } = body

    if (!text?.trim()) return apiError('text is required', 400)
    if (text.length > MAX_CHARS) return apiError(`text must be ≤ ${MAX_CHARS} characters`, 400)

    // ── Auth + tier check (non-blocking) ─────────────────────────────────────
    let userId: string | null = null
    try {
      const { auth } = await import('@clerk/nextjs/server')
      const session = await auth()
      userId = session?.userId ?? null
    } catch {}

    // Check tier limits if signed in and DB available
    if (userId) {
      try {
        const { prisma } = await import('@/lib/prisma')
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { tier: true, ttsCharsUsed: true, ttsCharsLimit: true },
        })
        if (user) {
          const LIMITS: Record<string, number> = { FREE: 0, STUDENT: 500_000, PRO: 2_000_000, BETA: 2_000_000 }
          const limit = LIMITS[user.tier] ?? 0
          if (limit === 0) {
            return apiError('HD Voice requires a Student or Pro plan. Upgrade to unlock.', 403)
          }
          if (user.ttsCharsUsed + text.length > Math.min(user.ttsCharsLimit || limit, limit)) {
            return apiError('HD Voice monthly limit reached. Resets at the start of your billing cycle.', 403)
          }
          // Update usage fire-and-forget
          prisma.user.update({
            where: { id: userId },
            data: { ttsCharsUsed: { increment: text.length } },
          }).catch(() => {})
        }
      } catch {
        // DB not ready — allow TTS for now
      }
    }
    // If no userId, still allow TTS (open beta mode until DB + auth fully set up)

    // ── Call OpenAI ──────────────────────────────────────────────────────────
    const openAIResp = await fetch(OPENAI_TTS_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model:           'tts-1',
        input:           text,
        voice:           voice,
        speed:           clampSpeed(speed),
        response_format: 'mp3',
      }),
    })

    if (!openAIResp.ok) {
      const errText = await openAIResp.text()
      console.error('[/api/tts] OpenAI error:', openAIResp.status, errText)
      return apiError(`Voice synthesis failed (${openAIResp.status})`, 502)
    }

    return new NextResponse(openAIResp.body, {
      status: 200,
      headers: {
        'Content-Type':      'audio/mpeg',
        'Transfer-Encoding': 'chunked',
        'Cache-Control':     'no-store',
      },
    })

  } catch (err) {
    console.error('[POST /api/tts]', err)
    return apiError(`Internal server error: ${err instanceof Error ? err.message : String(err)}`)
  }
}
