// api/summarise.js
// Secure proxy: verifies auth + subscription, then calls Anthropic server-side.
// The ANTHROPIC_API_KEY environment variable never reaches the browser.
//
// Cost-saving measures applied:
//   • BETA_MODE=true in env vars bypasses all tier limits (for beta testing)
//   • Input trimmed to 3,500 chars (~600 words) — enough for Haiku to understand any section
//   • References, figure captions, and author lists stripped before sending
//   • max_tokens reduced to 350 — the JSON output rarely exceeds 250 tokens
//   • Result: ~$0.0004 per summary (≈ $1 per 2,500 summaries)

import { sql } from './_db.js';
import jwt from 'jsonwebtoken';

const BETA_MODE = process.env.BETA_MODE === 'true';

const MONTHLY_LIMITS = {
  free:    5,
  student: Infinity,
  pro:     Infinity
};

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // ── 1. Verify auth token ────────────────────────────────────────────────────
  const decoded = verifyToken(req);
  if (!decoded) return res.status(401).json({ error: 'Not authenticated. Please log in.' });

  // ── 2. Load user + check limits (skipped in beta mode) ─────────────────────
  let user;
  try {
    const result = await sql`SELECT * FROM users WHERE id = ${decoded.userId}`;
    user = result.rows[0];
    if (!user) return res.status(401).json({ error: 'User not found' });

    if (!BETA_MODE) {
      // Subscription must be active or on free tier
      if (user.subscription_status === 'past_due') {
        return res.status(403).json({
          error: 'Your payment is overdue. Please update your billing details.',
          code: 'PAYMENT_FAILED'
        });
      }

      // Reset monthly counter if new month has started
      const now = new Date();
      const resetDate = new Date(user.summaries_reset_at);
      const newMonth =
        now.getFullYear() !== resetDate.getFullYear() ||
        now.getMonth()    !== resetDate.getMonth();

      if (newMonth) {
        await sql`UPDATE users SET summaries_used = 0, summaries_reset_at = NOW() WHERE id = ${user.id}`;
        user.summaries_used = 0;
      }

      // Enforce monthly summary limit
      const limit = MONTHLY_LIMITS[user.subscription_tier] ?? 5;
      if (isFinite(limit) && user.summaries_used >= limit) {
        return res.status(403).json({
          error: `You've used all ${limit} AI summaries included in your plan this month.`,
          code: 'LIMIT_REACHED',
          used: user.summaries_used,
          limit,
          tier: user.subscription_tier,
          resetsAt: getNextMonthStart()
        });
      }
    }

  } catch (err) {
    console.error('[summarise] DB error:', err);
    return res.status(500).json({ error: 'Database error' });
  }

  // ── 3. Validate and preprocess content ─────────────────────────────────────
  const { sectionTitle, content } = req.body || {};
  if (!content || content.trim().length < 50)
    return res.status(400).json({ error: 'Section content is too short to summarise' });

  // Strip noise before sending to save tokens
  const cleaned = content
    .split('\n')
    .filter(line => {
      const t = line.trim();
      if (!t) return false;
      if (/^\[?\d+\]?[\s.]\s*[A-Z]/.test(t)) return false;
      if (/^(Fig(ure)?|Table)\s*\d/i.test(t))  return false;
      if (/https?:\/\/|doi\.org|10\.\d{4}/i.test(t)) return false;
      if (t.includes('@') && t.length < 120)   return false;
      return true;
    })
    .join('\n');

  // Fall back to original content if filtering removed too much
  const source = cleaned.trim().length >= 100 ? cleaned : content;

  // Hard cap at 3,500 chars (~600 words)
  const truncated = source.slice(0, 3500);

  // Final safety check
  if (!truncated.trim())
    return res.status(400).json({ error: 'Section content is too short to summarise' });

  const system = `You are an expert academic reading assistant helping researchers with ADHD and dyslexia quickly understand research papers. Analyse the provided section and respond with ONLY valid JSON (no markdown, no preamble) in this exact format:
{
  "overview": "2-3 sentence plain-English summary of what this section covers and its main conclusion",
  "keyPoints": ["key finding or argument 1", "key finding or argument 2", "key finding or argument 3"],
  "importance": "one sentence explaining why this section matters to the paper's overall argument"
}`;

  // ── 4. Call Anthropic server-side ───────────────────────────────────────────
  let anthropicData;
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY || process.env.API,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 350,
        system,
        messages: [{ role: 'user', content: `Section: "${sectionTitle || 'Untitled'}"\n\n${truncated}` }]
      })
    });

    if (!response.ok) {
      const errBody = await response.json().catch(() => ({}));
      console.error('[summarise] Anthropic error:', response.status, errBody);
      if (response.status === 429)
        return res.status(503).json({ error: 'AI service busy — please try again in a moment' });
      return res.status(502).json({ error: 'AI service error: ' + (errBody.error?.message || response.status) });
    }

    anthropicData = await response.json();

  } catch (err) {
    console.error('[summarise] Anthropic fetch error:', err);
    return res.status(502).json({ error: 'Could not reach AI service' });
  }

  // ── 5. Parse response ───────────────────────────────────────────────────────
  const rawText = anthropicData.content?.[0]?.text || '';
  let parsed;
  try {
    const clean = rawText.replace(/```json|```/g, '').trim();
    parsed = JSON.parse(clean);
  } catch {
    parsed = { overview: rawText, keyPoints: [], importance: '' };
  }

  // ── 6. Increment usage counter (tracked even in beta — useful data) ─────────
  await sql`UPDATE users SET summaries_used = summaries_used + 1 WHERE id = ${user.id}`;

  const newUsed = user.summaries_used + 1;
  const tierLimit = BETA_MODE
    ? null
    : (MONTHLY_LIMITS[user.subscription_tier] === Infinity ? null : MONTHLY_LIMITS[user.subscription_tier]);

  return res.json({
    ...parsed,
    usage: {
      used:     newUsed,
      limit:    tierLimit,
      tier:     BETA_MODE ? 'beta' : user.subscription_tier,
      betaMode: BETA_MODE
    }
  });
}

function verifyToken(req) {
  try {
    const auth = req.headers.authorization;
    if (!auth?.startsWith('Bearer ')) return null;
    return jwt.verify(auth.slice(7), process.env.JWT_SECRET);
  } catch {
    return null;
  }
}

function getNextMonthStart() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() + 1, 1).toISOString().split('T')[0];
}
