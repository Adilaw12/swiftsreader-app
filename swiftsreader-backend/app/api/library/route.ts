// app/api/library/route.ts
// GET  /api/library  — list all papers for current user
// POST /api/library  — add a new paper

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getAuthUserId, apiError } from '@/lib/auth'

const FREE_PAPER_LIMIT = 3

const PAPER_INCLUDE = {
  notes:      true,
  highlights: { orderBy: { createdAt: 'desc' as const } },
  bookmarks:  { orderBy: { createdAt: 'desc' as const } },
  summaries:  { orderBy: { sectionIndex: 'asc' as const } },
}

// ── GET — list library ────────────────────────────────────────────────────────
export async function GET() {
  const result = await getAuthUserId()
  if (result instanceof NextResponse) return result
  const userId = result

  try {
    const papers = await prisma.paper.findMany({
      where:   { userId },
      orderBy: { addedDate: 'desc' },
      include: PAPER_INCLUDE,
    })
    return NextResponse.json(papers)
  } catch (err) {
    console.error('[GET /api/library]', err)
    return apiError('Internal server error')
  }
}

// ── POST — add paper ──────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const result = await getAuthUserId()
  if (result instanceof NextResponse) return result
  const userId = result

  try {
    const user = await prisma.user.findUnique({
      where:  { id: userId },
      select: { tier: true, _count: { select: { papers: true } } },
    })
    if (!user) return apiError('User not found', 404)

    // Enforce free tier limit
    if (user.tier === 'FREE' && user._count.papers >= FREE_PAPER_LIMIT) {
      return apiError(
        `Free plan is limited to ${FREE_PAPER_LIMIT} papers. Upgrade to Pro for unlimited.`,
        403,
      )
    }

    const body = await req.json()
    const { title, authors, year, journal, doi, tags, text, media } = body

    if (!title?.trim()) return apiError('Title is required', 400)

    const paper = await prisma.paper.create({
      data: {
        userId,
        title:   title.trim(),
        authors: authors?.trim() || null,
        year:    year?.trim()    || null,
        journal: journal?.trim() || null,
        doi:     doi?.trim()     || null,
        tags:    Array.isArray(tags) ? tags : [],
        text:    text  || null,
        media:   media || [],
      },
      include: PAPER_INCLUDE,
    })

    return NextResponse.json(paper, { status: 201 })
  } catch (err) {
    console.error('[POST /api/library]', err)
    return apiError('Internal server error')
  }
}
