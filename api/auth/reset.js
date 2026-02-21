// api/auth/reset.js — verify reset token and update password
import { sql } from '../_db.js';
import bcrypt from 'bcryptjs';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { token, password } = req.body || {};

  if (!token)    return res.status(400).json({ error: 'Reset token is required' });
  if (!password) return res.status(400).json({ error: 'New password is required' });
  if (password.length < 8)
    return res.status(400).json({ error: 'Password must be at least 8 characters' });

  try {
    // Find token — must be unused and not expired
    const result = await sql`
      SELECT t.id, t.user_id, u.email
      FROM password_reset_tokens t
      JOIN users u ON u.id = t.user_id
      WHERE t.token     = ${token}
        AND t.used      = false
        AND t.expires_at > NOW()
    `;

    const row = result.rows[0];
    if (!row) {
      return res.status(400).json({
        error: 'This reset link has expired or already been used. Please request a new one.'
      });
    }

    // Hash new password and update user
    const passwordHash = await bcrypt.hash(password, 12);
    await sql`UPDATE users SET password_hash = ${passwordHash} WHERE id = ${row.user_id}`;

    // Mark token as used
    await sql`UPDATE password_reset_tokens SET used = true WHERE id = ${row.id}`;

    return res.json({ message: 'Password updated successfully. You can now sign in.' });

  } catch (err) {
    console.error('[reset]', err);
    return res.status(500).json({ error: 'Server error — please try again' });
  }
}
