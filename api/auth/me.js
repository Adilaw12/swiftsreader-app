// api/auth/me.js — return the current user from JWT
import { sql } from '../_db.js';
import jwt from 'jsonwebtoken';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const authHeader = req.headers.authorization || req.headers.Authorization || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();

  if (!token) return res.status(401).json({ error: 'Not authenticated' });

  try {
    const secret = process.env.JWT_SECRET || 'dev-secret-change-in-production';
    const decoded = jwt.verify(token, secret);

    const result = await sql`
      SELECT id, email, subscription_tier, subscription_status,
             summaries_used, summaries_reset_at, created_at
      FROM users
      WHERE id = ${decoded.userId}
    `;
    const user = result.rows[0];
    if (!user) return res.status(401).json({ error: 'User not found' });

    return res.json({
      id:               user.id,
      email:            user.email,
      tier:             user.subscription_tier,
      status:           user.subscription_status,
      summariesUsed:    user.summaries_used,
      summariesResetAt: user.summaries_reset_at,
      createdAt:        user.created_at
    });
  } catch (err) {
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
    console.error('[me]', err);
    return res.status(500).json({ error: 'Server error' });
  }
}
