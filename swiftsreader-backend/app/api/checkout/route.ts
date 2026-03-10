// app/api/checkout/route.ts
// POST /api/checkout — create a Stripe checkout session for tier upgrade

import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { prisma } from '@/lib/prisma'
import { getAuthUserId, apiError } from '@/lib/auth'

export const dynamic = 'force-dynamic'

const PRICE_IDS: Record<string, string | undefined> = {
  student: process.env.STRIPE_PRICE_STUDENT,
  pro:     process.env.STRIPE_PRICE_PRO,
}

export async function POST(req: NextRequest) {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)
  const result = await getAuthUserId()
  if (result instanceof NextResponse) return result
  const userId = result

  try {
    const { plan } = await req.json()

    if (!['student', 'pro'].includes(plan)) {
      return apiError('plan must be "student" or "pro"', 400)
    }

    const priceId = PRICE_IDS[plan]
    if (!priceId) return apiError(`Stripe price ID for "${plan}" not configured`, 500)

    const user = await prisma.user.findUnique({
      where:  { id: userId },
      select: { email: true, stripeCustomerId: true },
    })
    if (!user) return apiError('User not found', 404)

    // Reuse or create Stripe customer
    let customerId = user.stripeCustomerId
    if (!customerId) {
      const customer = await stripe.customers.create({
        email:    user.email,
        metadata: { userId },
      })
      customerId = customer.id
      await prisma.user.update({ where: { id: userId }, data: { stripeCustomerId: customerId } })
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://swiftsreader.com'

    const session = await stripe.checkout.sessions.create({
      customer:   customerId,
      mode:       'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${appUrl}/app?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${appUrl}/app?checkout=cancelled`,
      metadata: { userId, plan },
      subscription_data: { metadata: { userId, plan } },
    })

    return NextResponse.json({ url: session.url })
  } catch (err) {
    console.error('[POST /api/checkout]', err)
    return apiError('Failed to create checkout session')
  }
}
