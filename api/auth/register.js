// api/auth/register.js — create a new user account
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

  const { email, password, inviteCode } = req.body || {};

  if (!email || !password)
    return res.status(400).json({ error: 'Email and password are required' });
  if (password.length < 8)
    return res.status(400).json({ error: 'Password must be at least 8 characters' });

  // Optional invite-code gate — set INVITE_CODE env var to enable
  const requiredCode = process.env.INVITE_CODE;
  if (requiredCode) {
    if (!inviteCode) {
      return res.status(403).json({
        error: 'An invite code is required to create an account.',
        code:  'INVITE_REQUIRED'
      });
    }
    if (inviteCode.trim() !== requiredCode.trim()) {
      return res.status(403).json({
        error: 'Invalid invite code. Please check and try again.',
        code:  'INVITE_INVALID'
      });
    }
  }

  const normalEmail = email.toLowerCase().trim();

  try {
    const existing = await sql`SELECT id FROM users WHERE email = ${normalEmail}`;
    if (existing.rows[0])
      return res.status(409).json({ error: 'An account with this email already exists.' });

    const passwordHash = await bcrypt.hash(password, 12);
    const result = await sql`
      INSERT INTO users (email, password_hash)
      VALUES (${normalEmail}, ${passwordHash})
      RETURNING id, email, subscription_tier, subscription_status, summaries_used
    `;
    const user = result.rows[0];
    const token = makeToken(user.id);

    return res.status(201).json({
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
    console.error('[register]', err);
    return res.status(500).json({ error: 'Server error — please try again' });
  }
}
