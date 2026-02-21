// api/auth/login.js — verify credentials and return a JWT
import { sql } from '../_db.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

function makeToken(userId) {
  const secret = process.env.JWT_SECRET || 'dev-secret-change-in-production';
  return jwt.sign({ userId }, secret, { expiresIn: '30d' });
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { email, password } = req.body || {};
  if (!email || !password)
    return res.status(400).json({ error: 'Email and password are required' });

  try {
    const result = await sql`
      SELECT * FROM users WHERE email = ${email.toLowerCase().trim()}
    `;
    const user = result.rows[0];

    if (!user) return res.status(401).json({ error: 'Invalid email or password' });

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return res.status(401).json({ error: 'Invalid email or password' });

    const token = makeToken(user.id);
    return res.json({
      token,
      user: {
        id:            user.id,
        email:         user.email,
        tier:          user.subscription_tier,
        status:        user.subscription_status,
        summariesUsed: user.summaries_used
      }
    });
  } catch (err) {
    console.error('[login]', err);
    return res.status(500).json({ error: 'Server error — please try again' });
  }
}
