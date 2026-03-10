// app/api/webhooks/stripe/route.ts
// POST /api/webhooks/stripe — handles subscription lifecycle events
// Must be in the public matcher so Clerk middleware doesn't block it

import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY!)
}

const TIER_MAP: Record<string, { tier: 'STUDENT' | 'PRO'; summariesLimit: number; ttsCharsLimit: number }> = {
  student: { tier: 'STUDENT', summariesLimit: 100,    ttsCharsLimit: 500_000   },
  pro:     { tier: 'PRO',     summariesLimit: 999999,  ttsCharsLimit: 2_000_000 },
}

export async function POST(req: NextRequest) {
  const stripe  = getStripe()
  const rawBody = await req.text()
  const sig     = req.headers.get('stripe-signature') ?? ''

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET!)
  } catch (err) {
    console.error('[Stripe webhook] Signature failed:', err)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  try {
    switch (event.type) {

      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const sub     = event.data.object as Stripe.Subscription
        const userId  = sub.metadata?.userId
        const plan    = sub.metadata?.plan
        const tierCfg = plan ? TIER_MAP[plan] : null

        if (userId && tierCfg && (sub.status === 'active' || sub.status === 'trialing')) {
          await prisma.user.update({
            where: { id: userId },
            data: {
              tier:                 tierCfg.tier,
              summariesLimit:       tierCfg.summariesLimit,
              ttsCharsLimit:        tierCfg.ttsCharsLimit,
              stripeSubscriptionId: sub.id,
            },
          })
          console.log(`[Stripe] Upgraded ${userId} → ${tierCfg.tier}`)
        }
        break
      }

      case 'customer.subscription.deleted': {
        const sub    = event.data.object as Stripe.Subscription
        const userId = sub.metadata?.userId
        if (userId) {
          await prisma.user.update({
            where: { id: userId },
            data: { tier: 'FREE', summariesLimit: 10, ttsCharsLimit: 0, stripeSubscriptionId: null },
          })
          console.log(`[Stripe] Downgraded ${userId} → FREE`)
        }
        break
      }

      case 'invoice.payment_failed': {
        const invoice  = event.data.object as Stripe.Invoice
        const customer = typeof invoice.customer === 'string'
          ? await stripe.customers.retrieve(invoice.customer)
          : invoice.customer
        const userId = (customer as Stripe.Customer).metadata?.userId
        console.warn(`[Stripe] Payment failed for ${userId || invoice.customer}`)
        break
      }
    }

    return NextResponse.json({ received: true })
  } catch (err) {
    console.error('[Stripe webhook] Handler error:', err)
    return NextResponse.json({ error: 'Handler failed' }, { status: 500 })
  }
}
