-- SwiftsReader database schema
-- Run this once in Vercel Postgres → Query Editor

CREATE TABLE IF NOT EXISTS users (
  id                     SERIAL PRIMARY KEY,
  email                  TEXT UNIQUE NOT NULL,
  password_hash          TEXT NOT NULL,
  stripe_customer_id     TEXT,
  stripe_subscription_id TEXT,
  subscription_tier      TEXT    NOT NULL DEFAULT 'free',   -- 'free' | 'student' | 'pro'
  subscription_status    TEXT    NOT NULL DEFAULT 'active', -- 'active' | 'cancelled' | 'past_due'
  summaries_used         INTEGER NOT NULL DEFAULT 0,
  summaries_reset_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Password reset tokens (expire after 1 hour)
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token      TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '1 hour'),
  used       BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS users_email_idx              ON users (email);
CREATE INDEX IF NOT EXISTS users_stripe_customer_idx    ON users (stripe_customer_id);
CREATE INDEX IF NOT EXISTS users_stripe_sub_idx         ON users (stripe_subscription_id);
CREATE INDEX IF NOT EXISTS reset_tokens_token_idx       ON password_reset_tokens (token);
CREATE INDEX IF NOT EXISTS reset_tokens_user_idx        ON password_reset_tokens (user_id);
