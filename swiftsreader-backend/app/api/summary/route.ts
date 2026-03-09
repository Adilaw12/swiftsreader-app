// app/api/summary/route.ts
// POST /api/summary — generate a Claude section summary
// Enforces per-tier limits, caches results in DB

import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { prisma } from '@/lib/prisma'
import { getAuthUserId, apiError } from '@/lib/auth'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const SUMMARY_LIMITS: Record<string, number> = {
  FREE:    10,
  STUDENT: 100,
  PRO:     Infinity,
  BETA:    Infinity,
}

export async function POST(req: NextRequest) {
  const result = await getAuthUserId()
  if (result instanceof NextResponse) return result
  const userId = result

  try {
    const { paperId, sectionIndex, sectionTitle, text } = await req.json()

    if (!paperId || sectionIndex === undefined || !text?.trim()) {
      return apiError('paperId, sectionIndex, and text are required', 400)
    }

    // Verify paper ownership
    const paper = await prisma.paper.findFirst({ where: { id: paperId, userId } })
    if (!paper) return apiError('Paper not found', 404)

    // Check usage limits
    const user = await prisma.user.findUnique({
      where:  { id: userId },
      select: { tier: true, summariesUsed: true, summariesLimit: true },
    })
    if (!user) return apiError('User not found', 404)

    const limit = SUMMARY_LIMITS[user.tier] ?? 10
    if (isFinite(limit) && user.summariesUsed >= limit) {
      return apiError(
        `Summary limit reached (${limit} for ${user.tier} plan). Upgrade for more.`,
        403,
      )
    }

    // Return cached summary if available
    const cached = await prisma.summary.findUnique({
      where: { paperId_sectionIndex: { paperId, sectionIndex } },
    })
    if (cached) {
      return NextResponse.json({
        summary: cached.content,
        cached:  true,
        usage:   { used: user.summariesUsed, limit: isFinite(limit) ? limit : null },
      })
    }

    // Generate with Claude
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
    const tokensUsed  = (message.usage?.input_tokens ?? 0) + (message.usage?.output_tokens ?? 0)

    // Store summary + increment usage atomically
    const [summary] = await prisma.$transaction([
      prisma.summary.create({
        data: { paperId, userId, sectionIndex, sectionTitle: sectionTitle || null, content: summaryText, tokensUsed },
      }),
      prisma.user.update({
        where: { id: userId },
        data:  { summariesUsed: { increment: 1 } },
      }),
    ])

    return NextResponse.json({
      summary: summary.content,
      cached:  false,
      usage: {
        used:  user.summariesUsed + 1,
        limit: isFinite(limit) ? limit : null,
      },
    })
  } catch (err) {
    console.error('[POST /api/summary]', err)
    return apiError('Failed to generate summary')
  }
}
