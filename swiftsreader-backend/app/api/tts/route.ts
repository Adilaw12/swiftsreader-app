// app/api/tts/route.ts
// POST /api/tts — converts text to audio using OpenAI TTS

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'

const OPENAI_TTS_URL = 'https://api.openai.com/v1/audio/speech'
const TTS_MODEL      = 'tts-1'
const DEFAULT_VOICE  = 'nova'
const MAX_CHARS      = 4096

function clampSpeed(speed?: number): number {
  if (!speed) return 1.0
  return Math.min(4.0, Math.max(0.25, speed))
}

function apiError(message: string, status = 500) {
  return NextResponse.json({ error: message }, { status })
}

export async function POST(req: NextRequest) {
  try {
    // ── Auth (non-blocking — if Clerk isn't available, still try) ────────────
    let userId: string | null = null
    try {
      const session = await auth()
      userId = session?.userId ?? null
    } catch (e) {
      console.warn('[/api/tts] Clerk auth unavailable:', e)
    }

    if (!userId) {
      return apiError('Unauthorised — please sign in to use HD Voice', 401)
    }

    // ── Parse body ───────────────────────────────────────────────────────────
    const body = await req.json()
    const { text, voice = DEFAULT_VOICE, speed } = body

    if (!text?.trim()) return apiError('text is required', 400)
    if (text.length > MAX_CHARS) {
      return apiError(`text must be ≤ ${MAX_CHARS} characters`, 400)
    }

    // ── Tier check (best-effort — skip if DB not ready) ──────────────────────
    try {
      const { prisma } = await import('@/lib/prisma')
      const user = await prisma.user.findUnique({
        where:  { id: userId },
        select: { tier: true, ttsCharsUsed: true, ttsCharsLimit: true },
      })

      if (user) {
        const TTS_LIMITS: Record<string, number> = {
          FREE: 0, STUDENT: 500_000, PRO: 2_000_000, BETA: 2_000_000,
        }
        const monthlyLimit = TTS_LIMITS[user.tier] ?? 0
        if (monthlyLimit === 0) {
          return apiError('HD Voice requires a Student or Pro plan', 403)
        }
        const effectiveLimit = Math.min(user.ttsCharsLimit || monthlyLimit, monthlyLimit)
        if (user.ttsCharsUsed + text.length > effectiveLimit) {
          return apiError('HD Voice monthly limit reached', 403)
        }

        // Update usage fire-and-forget
        prisma.user.update({
          where: { id: userId },
          data:  { ttsCharsUsed: { increment: text.length } },
        }).catch(() => {})
      }
    } catch (dbErr) {
      // DB not ready yet — allow TTS to proceed for now
      console.warn('[/api/tts] DB check skipped:', dbErr)
    }

    // ── Call OpenAI ──────────────────────────────────────────────────────────
    if (!process.env.OPENAI_API_KEY) {
      return apiError('OpenAI API key not configured', 500)
    }

    const openAIResp = await fetch(OPENAI_TTS_URL, {
      method:  'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        model:           TTS_MODEL,
        input:           text,
        voice:           voice,
        speed:           clampSpeed(speed),
        response_format: 'mp3',
      }),
    })

    if (!openAIResp.ok) {
      const errText = await openAIResp.text()
      console.error('[/api/tts] OpenAI error:', openAIResp.status, errText)
      return apiError(`Voice synthesis failed: ${openAIResp.status}`, 502)
    }

    return new NextResponse(openAIResp.body, {
      status:  200,
      headers: {
        'Content-Type':      'audio/mpeg',
        'Transfer-Encoding': 'chunked',
        'Cache-Control':     'no-store',
      },
    })

  } catch (err) {
    console.error('[POST /api/tts] Unexpected error:', err)
    return apiError(`Internal server error: ${err instanceof Error ? err.message : String(err)}`)
  }
}
