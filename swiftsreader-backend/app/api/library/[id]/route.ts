// app/api/library/[id]/route.ts
// GET    /api/library/:id  — get single paper with all relations
// PATCH  /api/library/:id  — update paper (progress, notes, highlights, metadata)
// DELETE /api/library/:id  — remove paper

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getAuthUserId, apiError } from '@/lib/auth'

const PAPER_INCLUDE = {
  notes:      true,
  highlights: { orderBy: { createdAt: 'desc' as const } },
  bookmarks:  { orderBy: { createdAt: 'desc' as const } },
  summaries:  { orderBy: { sectionIndex: 'asc' as const } },
}

type RouteParams = { params: Promise<{ id: string }> }

// ── GET ───────────────────────────────────────────────────────────────────────
export async function GET(_req: NextRequest, { params }: RouteParams) {
  const result = await getAuthUserId()
  if (result instanceof NextResponse) return result
  const userId = result
  const { id } = await params

  try {
    const paper = await prisma.paper.findFirst({
      where:   { id, userId },
      include: PAPER_INCLUDE,
    })
    if (!paper) return apiError('Paper not found', 404)
    return NextResponse.json(paper)
  } catch (err) {
    console.error('[GET /api/library/[id]]', err)
    return apiError('Internal server error')
  }
}

// ── PATCH ─────────────────────────────────────────────────────────────────────
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const result = await getAuthUserId()
  if (result instanceof NextResponse) return result
  const userId = result
  const { id } = await params

  try {
    // Verify ownership
    const existing = await prisma.paper.findFirst({ where: { id, userId } })
    if (!existing) return apiError('Paper not found', 404)

    const body = await req.json()
    const {
      title, authors, year, journal, doi, tags,
      progress, currentIndex, completed, readingTime,
      notes, highlights, bookmarks,
    } = body

    // Update core fields
    await prisma.paper.update({
      where: { id },
      data: {
        ...(title        !== undefined && { title }),
        ...(authors      !== undefined && { authors }),
        ...(year         !== undefined && { year }),
        ...(journal      !== undefined && { journal }),
        ...(doi          !== undefined && { doi }),
        ...(tags         !== undefined && { tags }),
        ...(progress     !== undefined && { progress }),
        ...(currentIndex !== undefined && { currentIndex }),
        ...(completed    !== undefined && { completed }),
        ...(readingTime  !== undefined && { readingTime }),
      },
    })

    // Upsert notes
    if (notes) {
      await prisma.note.upsert({
        where:  { paperId: id },
        create: { paperId: id, ...notes },
        update: notes,
      })
    }

    // Replace highlights
    if (Array.isArray(highlights)) {
      await prisma.highlight.deleteMany({ where: { paperId: id } })
      if (highlights.length > 0) {
        await prisma.highlight.createMany({
          data: highlights.map((h: { text: string; note?: string; wordIndex: number }) => ({
            paperId: id, text: h.text, note: h.note || null, wordIndex: h.wordIndex,
          })),
        })
      }
    }

    // Replace bookmarks
    if (Array.isArray(bookmarks)) {
      await prisma.bookmark.deleteMany({ where: { paperId: id } })
      if (bookmarks.length > 0) {
        await prisma.bookmark.createMany({
          data: bookmarks.map((b: { label?: string; wordIndex: number }) => ({
            paperId: id, label: b.label || null, wordIndex: b.wordIndex,
          })),
        })
      }
    }

    const updated = await prisma.paper.findFirst({ where: { id }, include: PAPER_INCLUDE })
    return NextResponse.json(updated)
  } catch (err) {
    console.error('[PATCH /api/library/[id]]', err)
    return apiError('Internal server error')
  }
}

// ── DELETE ────────────────────────────────────────────────────────────────────
export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  const result = await getAuthUserId()
  if (result instanceof NextResponse) return result
  const userId = result
  const { id } = await params

  try {
    const existing = await prisma.paper.findFirst({ where: { id, userId } })
    if (!existing) return apiError('Paper not found', 404)

    await prisma.paper.delete({ where: { id } })
    return NextResponse.json({ deleted: true })
  } catch (err) {
    console.error('[DELETE /api/library/[id]]', err)
    return apiError('Internal server error')
  }
}
