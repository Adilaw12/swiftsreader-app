// app/api/sessions/route.ts
// POST /api/sessions — log a reading session
// GET  /api/sessions — reading stats (week / month / all-time)

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getAuthUserId, apiError } from '@/lib/auth'

export async function GET() {
  const result = await getAuthUserId()
  if (result instanceof NextResponse) return result
  const userId = result

  try {
    const now      = new Date()
    const weekAgo  = new Date(now.getTime() - 7  * 24 * 60 * 60 * 1000)
    const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

    const [weekSessions, monthSessions, allTime] = await Promise.all([
      prisma.readingSession.findMany({ where: { userId, date: { gte: weekAgo } } }),
      prisma.readingSession.findMany({ where: { userId, date: { gte: monthAgo } } }),
      prisma.readingSession.aggregate({
        where: { userId },
        _sum:  { duration: true, wordsRead: true },
        _count: true,
      }),
    ])

    const weekMinutes  = weekSessions.reduce((a, s) => a + s.duration, 0) / 60
    const monthMinutes = monthSessions.reduce((a, s) => a + s.duration, 0) / 60
    const papersThisWeek = new Set(weekSessions.map(s => s.paperId).filter(Boolean)).size

    return NextResponse.json({
      week:    { minutes: Math.round(weekMinutes), papers: papersThisWeek, sessions: weekSessions.length },
      month:   { minutes: Math.round(monthMinutes) },
      allTime: { minutes: Math.round((allTime._sum.duration || 0) / 60), wordsRead: allTime._sum.wordsRead || 0, sessions: allTime._count },
    })
  } catch (err) {
    console.error('[GET /api/sessions]', err)
    return apiError('Internal server error')
  }
}

export async function POST(req: NextRequest) {
  const result = await getAuthUserId()
  if (result instanceof NextResponse) return result
  const userId = result

  try {
    const { paperId, duration, wordsRead } = await req.json()
    if (!duration || duration < 1) return apiError('duration is required', 400)

    const session = await prisma.readingSession.create({
      data: { userId, paperId: paperId || null, duration: Math.round(duration), wordsRead: wordsRead || 0 },
    })
    return NextResponse.json(session, { status: 201 })
  } catch (err) {
    console.error('[POST /api/sessions]', err)
    return apiError('Internal server error')
  }
}
