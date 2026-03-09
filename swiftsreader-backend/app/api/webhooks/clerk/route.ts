// app/api/webhooks/clerk/route.ts
// POST /api/webhooks/clerk
// Handles user lifecycle AND Clerk Billing plan changes
// Fires on: user.created, user.updated, user.deleted
//           billing.plan.updated  (Clerk Billing)
//           billing.subscription.deleted (Clerk Billing)

import { NextRequest, NextResponse } from 'next/server'
import { Webhook } from 'svix'
import { prisma } from '@/lib/prisma'

// Plan slug → tier config
// Set slugs to match what you create in Clerk Dashboard -> Billing -> Plans
const PLAN_MAP: Record<string, { tier: 'FREE' | 'STUDENT' | 'PRO'; summariesLimit: number; ttsCharsLimit: number }> = {
  free:    { tier: 'FREE',    summariesLimit: 10,     ttsCharsLimit: 0         },
  student: { tier: 'STUDENT', summariesLimit: 100,    ttsCharsLimit: 500_000   },
  pro:     { tier: 'PRO',     summariesLimit: 999999, ttsCharsLimit: 2_000_000 },
}

interface ClerkEvent {
  type: string
  data: Record<string, any>
}

export async function POST(req: NextRequest) {
  const rawBody       = await req.text()
  const svixId        = req.headers.get('svix-id')        ?? ''
  const svixTimestamp = req.headers.get('svix-timestamp') ?? ''
  const svixSignature = req.headers.get('svix-signature') ?? ''

  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json({ error: 'Missing Svix headers' }, { status: 400 })
  }

  const wh = new Webhook(process.env.CLERK_WEBHOOK_SECRET!)
  let event: ClerkEvent

  try {
    event = wh.verify(rawBody, {
      'svix-id': svixId, 'svix-timestamp': svixTimestamp, 'svix-signature': svixSignature,
    }) as ClerkEvent
  } catch (err) {
    console.error('[Clerk webhook] Verification failed:', err)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  try {
    switch (event.type) {

      case 'user.created': {
        const email = event.data.email_addresses?.[0]?.email_address
        if (!email) break
        await prisma.user.upsert({
          where:  { id: event.data.id },
          create: { id: event.data.id, email, tier: 'FREE', summariesUsed: 0, summariesLimit: 10, ttsCharsUsed: 0, ttsCharsLimit: 0 },
          update: { email },
        })
        console.log(`[Clerk] Created user ${event.data.id}`)
        break
      }

      case 'user.updated': {
        const email = event.data.email_addresses?.[0]?.email_address
        if (!email) break
        await prisma.user.update({ where: { id: event.data.id }, data: { email } })
        break
      }

      case 'user.deleted': {
        await prisma.user.delete({ where: { id: event.data.id } }).catch(() => {})
        console.log(`[Clerk] Deleted user ${event.data.id}`)
        break
      }

      // Clerk Billing: plan subscribed / changed
      case 'billing.plan.updated': {
        const userId = event.data.user_id
        const slug   = event.data.plan?.slug?.toLowerCase()
        const status = event.data.status
        if (!userId) break
        const planCfg = (status === 'active' && slug && PLAN_MAP[slug]) ? PLAN_MAP[slug] : PLAN_MAP['free']
        await prisma.user.update({
          where: { id: userId },
          data:  { tier: planCfg.tier, summariesLimit: planCfg.summariesLimit, ttsCharsLimit: planCfg.ttsCharsLimit },
        })
        console.log(`[Clerk Billing] ${userId} -> ${planCfg.tier} (${slug}, ${status})`)
        break
      }

      // Clerk Billing: subscription cancelled
      case 'billing.subscription.deleted': {
        const userId = event.data.user_id
        if (!userId) break
        await prisma.user.update({
          where: { id: userId },
          data:  { tier: 'FREE', summariesLimit: 10, ttsCharsLimit: 0 },
        })
        console.log(`[Clerk Billing] Subscription cancelled for ${userId} -> FREE`)
        break
      }
    }

    return NextResponse.json({ received: true })
  } catch (err) {
    console.error('[Clerk webhook] Handler error:', err)
    return NextResponse.json({ error: 'Handler failed' }, { status: 500 })
  }
}
