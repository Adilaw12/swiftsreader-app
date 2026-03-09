// app/api/health/route.ts
// GET /api/health — checks DB, Clerk env, OpenAI env, Anthropic env
// Safe to leave in production: returns no secrets, only status flags.

import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

export async function GET() {
  const checks: Record<string, { ok: boolean; detail?: string }> = {}

  // ── ENV presence ──────────────────────────────────────────────────────────
  checks.database_url = {
    ok: !!process.env.DATABASE_URL,
    detail: process.env.DATABASE_URL
      ? process.env.DATABASE_URL.startsWith('prisma+postgres://')
        ? 'present — correct prisma+postgres:// scheme ✓'
        : `present BUT wrong scheme: starts with "${process.env.DATABASE_URL.slice(0, 20)}..." (should be prisma+postgres://)`
      : 'MISSING'
  }
  checks.clerk_publishable = {
    ok: !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
    detail: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ? 'present ✓' : 'MISSING'
  }
  checks.clerk_secret = {
    ok: !!process.env.CLERK_SECRET_KEY,
    detail: process.env.CLERK_SECRET_KEY ? 'present ✓' : 'MISSING'
  }
  checks.openai = {
    ok: !!process.env.OPENAI_API_KEY,
    detail: process.env.OPENAI_API_KEY ? 'present ✓' : 'MISSING'
  }
  checks.anthropic = {
    ok: !!process.env.ANTHROPIC_API_KEY,
    detail: process.env.ANTHROPIC_API_KEY ? 'present ✓' : 'MISSING'
  }
  checks.stripe_secret = {
    ok: !!process.env.STRIPE_SECRET_KEY,
    detail: process.env.STRIPE_SECRET_KEY ? 'present ✓' : 'MISSING'
  }

  // ── Live DB ping ──────────────────────────────────────────────────────────
  if (checks.database_url.ok) {
    try {
      const { prisma } = await import('@/lib/prisma')
      await prisma.$queryRaw`SELECT 1`
      checks.database_ping = { ok: true, detail: 'connected ✓' }
    } catch (err: any) {
      checks.database_ping = {
        ok: false,
        detail: err?.message?.slice(0, 200) ?? 'unknown error'
      }
    }
  } else {
    checks.database_ping = { ok: false, detail: 'skipped — DATABASE_URL missing' }
  }

  const allOk = Object.values(checks).every(c => c.ok)
  return NextResponse.json({ ok: allOk, checks }, { status: allOk ? 200 : 500 })
}
