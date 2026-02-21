// api/stripe/webhook.js — handle Stripe subscription lifecycle events
import { sql } from '../_db.js';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_WEBHOOK_SECRET) {
    return res.status(503).json({ error: 'Stripe not configured' });
  }

  const { default: Stripe } = await import('stripe');
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const sig = req.headers['stripe-signature'];

  let event;
  try {
    // req.body must be the raw buffer — configured via vercel.json
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('[webhook] Signature verification failed:', err.message);
    return res.status(400).json({ error: `Webhook error: ${err.message}` });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const userId = session.metadata?.userId;
        const plan   = session.metadata?.plan;
        if (userId && plan) {
          await sql`
            UPDATE users
            SET subscription_tier   = ${plan},
                subscription_status = 'active',
                stripe_customer_id  = ${session.customer},
                stripe_subscription_id = ${session.subscription}
            WHERE id = ${parseInt(userId)}
          `;
          console.log(`[webhook] User ${userId} upgraded to ${plan}`);
        }
        break;
      }

      case 'customer.subscription.updated': {
        const sub = event.data.object;
        const status = sub.status === 'active' ? 'active' : sub.status;
        await sql`
          UPDATE users SET subscription_status = ${status}
          WHERE stripe_subscription_id = ${sub.id}
        `;
        break;
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object;
        await sql`
          UPDATE users
          SET subscription_tier   = 'free',
              subscription_status = 'cancelled',
              stripe_subscription_id = NULL
          WHERE stripe_subscription_id = ${sub.id}
        `;
        console.log(`[webhook] Subscription ${sub.id} cancelled — user downgraded to free`);
        break;
      }

      default:
        // Ignore unhandled event types
        break;
    }
  } catch (err) {
    console.error('[webhook] Handler error:', err);
    return res.status(500).json({ error: 'Webhook handler failed' });
  }

  return res.json({ received: true });
}
