# SwiftsReader — Beta Deployment Guide
*Live URL for testers in ~15 minutes. No Stripe needed.*

---

## Repo structure

```
swiftsreader/
├── index.html                      ← rename swiftreader-landing-updated.html to this
├── login.html
├── app.html
├── package.json
├── vercel.json
├── sql/
│   └── database-init.sql
└── api/
    ├── summarise.js                ← copy of api-summarise.js
    ├── auth/
    │   ├── register.js             ← api-auth-register.js
    │   ├── login.js                ← api-auth-login.js
    │   ├── me.js                   ← api-auth-me.js
    │   ├── forgot.js               ← api-auth-forgot.js
    │   └── reset.js                ← api-auth-reset.js
    └── stripe/
        ├── checkout.js             ← api-stripe-checkout.js
        └── webhook.js              ← api-stripe-webhook.js
```

> **File naming:** The output files are named with dashes for easy download (e.g. `api-auth-login.js`).
> When you put them in your repo, use the folder structure above — `api/auth/login.js` etc.

---

## Step 1 — GitHub repo

1. Go to **github.com → New repository** → name `swiftsreader` → Private → Create
2. Upload all files matching the structure above
3. Rename `swiftreader-landing-updated.html` → `index.html`

---

## Step 2 — Deploy to Vercel

1. Go to **vercel.com** → sign up with GitHub → **Add New Project** → select `swiftsreader` → **Deploy**
2. Vercel gives you a URL like `https://swiftsreader.vercel.app`

---

## Step 3 — Postgres database

1. Vercel project → **Storage** tab → **Create Database** → **Postgres** → Create
2. **Storage → Query** tab → paste `database-init.sql` → **Run**

---

## Step 4 — Environment variables

**Settings → Environment Variables:**

| Variable | Value | Notes |
|----------|-------|-------|
| `JWT_SECRET` | Any long random string | e.g. `swifts-beta-xK9mP2026!` |
| `ANTHROPIC_API_KEY` | `sk-ant-api03-...` | console.anthropic.com → API Keys |
| `BETA_MODE` | `true` | Everyone gets unlimited access |
| `BETA_INVITE_CODE` | `swifts2026` | Your invite word (or leave blank for open signup) |
| `APP_URL` | `https://swiftsreader.vercel.app` | Your actual Vercel URL |
| `RESEND_API_KEY` | *(optional)* | resend.com — needed for password reset emails |

After adding all vars → **Redeploy** (Settings → Deployments → Redeploy latest).

---

## Step 5 — Test it

1. Visit `https://swiftsreader.vercel.app/login`
2. Create an account (enter invite code if prompted)
3. Upload a PDF → open Summaries tab → Generate All Summaries
4. Summaries work with no limit, badge shows **BETA**
5. Test "Forgot password" → check your email (or Vercel logs if RESEND_API_KEY not set)

---

## Sharing with testers

> **SwiftsReader Beta** — academic reading for ADHD & dyslexic minds
>
> Sign up: https://swiftsreader.vercel.app/login
> Invite code: **swifts2026**
>
> Feedback form: [link]

---

## Monitor usage

In Vercel → Storage → Query:

```sql
-- All users and activity
SELECT email, subscription_tier, summaries_used, created_at
FROM users ORDER BY summaries_used DESC;

-- Totals
SELECT COUNT(*) AS users, SUM(summaries_used) AS total_summaries FROM users;
```

Cost estimate: ~$0.0004/summary. 100 users × 50 summaries = **~$2 total**.

Set a monthly spend cap at **console.anthropic.com → Settings → Limits** as a safety net.

---

## When ready to add paid plans

1. Set `BETA_MODE` to `false` (or delete it)
2. Set `BETA_INVITE_CODE` to blank (or delete it) for open registration
3. Follow `DEPLOYMENT_GUIDE.md` to set up Stripe
4. Add `STRIPE_SECRET_KEY`, `STRIPE_PRO_PRICE_ID`, `STRIPE_STUDENT_PRICE_ID`, `STRIPE_WEBHOOK_SECRET`
5. Redeploy — tier limits and upgrade prompts activate automatically
