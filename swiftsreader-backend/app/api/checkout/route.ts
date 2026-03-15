// app/api/checkout/route.ts
// POST /api/checkout — create a Stripe checkout session for tier upgrade

import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { prisma } from '@/lib/prisma'
import { apiError } from '@/lib/auth'

const getStripe = () => new Stripe(process.env.STRIPE_SECRET_KEY || 'placeholder')

const PRICE_IDS: Record<string, string | undefined> = {
  student: process.env.STRIPE_PRICE_STUDENT,
  pro:     process.env.STRIPE_PRICE_PRO,
}

export async function POST(req: NextRequest) {
  // Try Clerk auth() directly first
  let userId: string | null = null
  try {
    const { auth } = await import('@clerk/nextjs/server')
    const session = await auth()
    userId = session?.userId ?? null
    console.log('[Checkout] Clerk userId:', userId)
  } catch (e) {
    console.error('[Checkout] auth() failed:', e)
  }

  if (!userId) {
    console.error('[Checkout] No userId — unauthorised')
    return NextResponse.json({ error: 'Unauthorised — please sign in' }, { status: 401 })
  }

  try {
    const { plan } = await req.json()

    if (!['student', 'pro'].includes(plan)) {
      return apiError('plan must be "student" or "pro"', 400)
    }

    const priceId = PRICE_IDS[plan]
    if (!priceId) return apiError(`Stripe price ID for "${plan}" not configured`, 500)

    // Find or create user — in case Clerk webhook hasn't fired yet
    let user = await prisma.user.findUnique({
      where:  { id: userId },
      select: { email: true, stripeCustomerId: true },
    })
    if (!user) {
      // Get email from Clerk session
      const { currentUser } = await import('@clerk/nextjs/server')
      const clerkUser = await currentUser()
      const email = clerkUser?.emailAddresses?.[0]?.emailAddress || ''
      user = await prisma.user.upsert({
        where:  { id: userId },
        create: { id: userId, email, tier: 'FREE', summariesUsed: 0, summariesLimit: 10, ttsCharsUsed: 0, ttsCharsLimit: 0 },
        update: {},
        select: { email: true, stripeCustomerId: true },
      })
      console.log(`[Checkout] Auto-created user ${userId}`)
    }

    // Reuse or create Stripe customer
    let customerId = user.stripeCustomerId
    if (!customerId) {
      const customer = await getStripe().customers.create({
        email:    user.email,
        metadata: { userId },
      })
      customerId = customer.id
      await prisma.user.update({ where: { id: userId }, data: { stripeCustomerId: customerId } })
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://swiftsreader.com'

    const session = await getStripe().checkout.sessions.create({
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
