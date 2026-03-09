# SwiftsReader — Backend

Next.js App Router API built on Clerk, Prisma Postgres, Anthropic, and Stripe.

---

## Stack

| Service    | Purpose                              |
|------------|--------------------------------------|
| Next.js 15 | App Router + serverless API routes   |
| Clerk      | Auth — keyless mode, no signup needed to start |
| Prisma     | ORM + Postgres (claret-bucket)       |
| Anthropic  | AI section summaries (Claude)        |
| Stripe     | Subscriptions + payments             |
| Resend     | Transactional email                  |

---

## Quick Start

```bash
# 1. Install
npm install

# 2. Copy env template
cp .env.example .env.local
# Fill in values (Clerk keyless mode means you can skip Clerk keys initially)

# 3. Push schema to database
npm run db:push

# 4. Run locally
npm run dev

# 5. Deploy
vercel --prod
```

---

## Webhook Setup (after deploy)

**Clerk** → Dashboard → Webhooks → Add endpoint
- URL: `https://swiftsreader.com/api/webhooks/clerk`
- Events: `user.created`, `user.updated`, `user.deleted`
- Copy Signing Secret → `CLERK_WEBHOOK_SECRET` in Vercel env vars

**Stripe** → Dashboard → Developers → Webhooks → Add endpoint
- URL: `https://swiftsreader.com/api/webhooks/stripe`
- Events: `customer.subscription.created`, `.updated`, `.deleted`, `invoice.payment_failed`
- Copy Signing Secret → `STRIPE_WEBHOOK_SECRET` in Vercel env vars

---

## API Routes

| Method | Route                      | Auth     | Description                       |
|--------|----------------------------|----------|-----------------------------------|
| GET    | `/api/auth/me`             | Required | Current user profile + usage      |
| GET    | `/api/library`             | Required | List all papers                   |
| POST   | `/api/library`             | Required | Add paper (enforces FREE limit)   |
| GET    | `/api/library/:id`         | Required | Single paper with all data        |
| PATCH  | `/api/library/:id`         | Required | Update progress, notes, highlights|
| DELETE | `/api/library/:id`         | Required | Delete paper                      |
| POST   | `/api/summary`             | Required | Generate AI summary (Claude)      |
| POST   | `/api/checkout`            | Required | Create Stripe checkout session    |
| GET    | `/api/sessions`            | Required | Reading stats                     |
| POST   | `/api/sessions`            | Required | Log reading session               |
| POST   | `/api/webhooks/clerk`      | Public   | Clerk user sync                   |
| POST   | `/api/webhooks/stripe`     | Public   | Stripe subscription events        |

---

## Tier Limits

| Tier    | Papers | Summaries |
|---------|--------|-----------|
| FREE    | 3      | 10        |
| STUDENT | ∞      | 100       |
| PRO     | ∞      | ∞         |
| BETA    | ∞      | ∞         |
