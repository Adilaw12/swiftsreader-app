// api/auth/forgot.js — send a password reset email
import { sql } from '../_db.js';
import crypto from 'crypto';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { email } = req.body || {};
  if (!email) return res.status(400).json({ error: 'Email is required' });

  // Always return success — don't reveal whether the email exists
  const SUCCESS = { message: 'If that email exists, a reset link has been sent.' };

  const normalEmail = email.toLowerCase().trim();

  try {
    const result = await sql`SELECT id FROM users WHERE email = ${normalEmail}`;
    const user = result.rows[0];

    // Silently succeed if email not found — security best practice
    if (!user) return res.json(SUCCESS);

    // Invalidate any existing tokens for this user
    await sql`DELETE FROM password_reset_tokens WHERE user_id = ${user.id}`;

    // Generate a secure random token
    const token = crypto.randomBytes(32).toString('hex');

    await sql`
      INSERT INTO password_reset_tokens (user_id, token)
      VALUES (${user.id}, ${token})
    `;

    const appUrl = process.env.APP_URL || 'https://swiftsreader.vercel.app';
    const resetUrl = `${appUrl}/login?reset=${token}`;

    // Send email via Resend
    if (!process.env.RESEND_API_KEY) {
      // No email service configured — log the link for testing
      console.log(`[forgot] Reset URL for ${normalEmail}: ${resetUrl}`);
      return res.json(SUCCESS);
    }

    const { Resend } = await import('resend');
    const resend = new Resend(process.env.RESEND_API_KEY);

    await resend.emails.send({
      from:    'SwiftsReader <noreply@swiftsreader.com>',
      to:      normalEmail,
      subject: 'Reset your SwiftsReader password',
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 16px;">
          <img src="${appUrl}/logo.jpg" alt="SwiftsReader" style="height:40px;margin-bottom:24px;">
          <h2 style="margin:0 0 12px;color:#212121;">Reset your password</h2>
          <p style="color:#616161;margin:0 0 24px;">
            We received a request to reset the password for your SwiftsReader account.
            Click the button below — this link expires in 1 hour.
          </p>
          <a href="${resetUrl}"
             style="display:inline-block;background:#00BCD4;color:white;font-weight:700;
                    padding:14px 28px;border-radius:10px;text-decoration:none;font-size:15px;">
            Reset Password
          </a>
          <p style="color:#9E9E9E;font-size:12px;margin-top:32px;">
            If you didn't request this, you can safely ignore this email.<br>
            This link will expire in 1 hour.
          </p>
        </div>
      `
    });

    return res.json(SUCCESS);

  } catch (err) {
    console.error('[forgot]', err);
    // Still return success to avoid leaking info
    return res.json(SUCCESS);
  }
}
