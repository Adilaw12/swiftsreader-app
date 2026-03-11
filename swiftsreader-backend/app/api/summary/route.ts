// app/api/summary/route.ts
// POST /api/summary — generate a Claude section summary
// Works with or without DB (graceful fallback for early deployment)

import { NextRequest, NextResponse } from 'next/server'

function apiError(message: string, status = 500) {
  return NextResponse.json({ error: message }, { status })
}

export async function POST(req: NextRequest) {
  try {
    const { paperId, sectionIndex, sectionTitle, text } = await req.json()

    if (!text?.trim()) {
      return apiError('text is required', 400)
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return apiError('AI service not configured', 503)
    }

    // ── Try DB cache and limits (non-blocking) ────────────────────────────────
    let userId: string | null = null
    try {
      const { auth } = await import('@clerk/nextjs/server')
      const session = await auth()
      userId = session?.userId ?? null
    } catch {}

    try {
      const { prisma } = await import('@/lib/prisma')

      // Check cache
      if (paperId && sectionIndex !== undefined) {
        const cached = await prisma.summary.findUnique({
          where: { paperId_sectionIndex: { paperId, sectionIndex } },
        })
        if (cached) {
          return NextResponse.json({ summary: cached.content, cached: true })
        }
      }

      // Check usage limit for signed-in users
      if (userId) {
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { tier: true, summariesUsed: true },
        })
        if (user) {
          const LIMITS: Record<string, number> = { FREE: 10, STUDENT: 100, PRO: 999999, BETA: 999999 }
          const limit = LIMITS[user.tier] ?? 10
          if (user.summariesUsed >= limit) {
            return apiError(`Summary limit reached (${limit} for ${user.tier} plan). Upgrade for more.`, 403)
          }
        }
      }
    } catch (dbErr) {
      // DB not ready — allow summary to proceed
      console.warn('[/api/summary] DB unavailable, proceeding without limits:', dbErr)
    }

    // ── Generate with Claude ──────────────────────────────────────────────────
    const { default: Anthropic } = await import('@anthropic-ai/sdk')
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

    const prompt = `You are an expert academic research assistant helping a researcher understand a paper efficiently.

Summarise the following section from a research paper${sectionTitle ? ` titled "${sectionTitle}"` : ''}.

Write a concise summary (150–250 words) covering:
- The key argument or finding
- Methods or evidence used (if applicable)
- Why this matters in the context of the paper

Write clearly for an academic audience. Do not use bullet points — write in prose.

Section text:
"""
${text.slice(0, 8000)}
"""`

    const message = await client.messages.create({
      model:      'claude-sonnet-4-20250514',
      max_tokens: 500,
      messages:   [{ role: 'user', content: prompt }],
    })

    const summaryText = (message.content[0] as { text: string })?.text || ''

    // ── Store to DB (non-blocking) ────────────────────────────────────────────
    if (userId && paperId && sectionIndex !== undefined) {
      try {
        const { prisma } = await import('@/lib/prisma')
        await prisma.$transaction([
          prisma.summary.create({
            data: { paperId, userId, sectionIndex, sectionTitle: sectionTitle || null, content: summaryText, tokensUsed: 0 },
          }),
          prisma.user.update({
            where: { id: userId },
            data: { summariesUsed: { increment: 1 } },
          }),
        ])
      } catch {}
    }

    return NextResponse.json({ summary: summaryText, cached: false })

  } catch (err) {
    console.error('[POST /api/summary]', err)
    return apiError(`Failed to generate summary: ${err instanceof Error ? err.message : String(err)}`)
  }
}
