// api/stripe/checkout.js
import { sql } from '../_db.js';
import jwt from 'jsonwebtoken';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Lazy-load Stripe so missing env var doesn't break module load
  if (!process.env.STRIPE_SECRET_KEY)
    return res.status(503).json({ error: 'Payments not configured yet' });

  const { default: Stripe } = await import('stripe');
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

  const PRICE_IDS = {
    pro:     process.env.STRIPE_PRO_PRICE_ID,
    student: process.env.STRIPE_STUDENT_PRICE_ID
  };

  const decoded = verifyToken(req);
  if (!decoded) return res.status(401).json({ error: 'Not authenticated' });

  const { plan } = req.body || {};
  if (!PRICE_IDS[plan]) return res.status(400).json({ error: 'Invalid plan. Choose "pro" or "student"' });

  try {
    const result = await sql`SELECT * FROM users WHERE id = ${decoded.userId}`;
    const user = result.rows[0];
    if (!user) return res.status(401).json({ error: 'User not found' });

    if (plan === 'student' && !user.email.endsWith('.edu'))
      return res.status(403).json({ error: 'Student plan requires a .edu email address' });

    // Create or reuse Stripe customer
    let customerId = user.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { userId: String(user.id) }
      });
      customerId = customer.id;
      await sql`UPDATE users SET stripe_customer_id = ${customerId} WHERE id = ${user.id}`;
    }

    const origin = req.headers.origin || process.env.APP_URL || 'https://swiftsreader.vercel.app';

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      mode: 'subscription',
      line_items: [{ price: PRICE_IDS[plan], quantity: 1 }],
      success_url: `${origin}/app?checkout=success`,
      cancel_url:  `${origin}/app?checkout=cancelled`,
      metadata: { userId: String(user.id), plan }
    });

    return res.json({ url: session.url });

  } catch (err) {
    console.error('[checkout]', err);
    return res.status(500).json({ error: 'Could not create checkout session' });
  }
}

function verifyToken(req) {
  try {
    const auth = req.headers.authorization;
    if (!auth?.startsWith('Bearer ')) return null;
    return jwt.verify(auth.slice(7), process.env.JWT_SECRET);
  } catch { return null; }
}
