-- Suzu Sensei — D1 schema for the admin dashboard.
-- Run once against your D1 database (see setup instructions).

CREATE TABLE IF NOT EXISTS trial_bookings (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  name            TEXT NOT NULL,
  email           TEXT NOT NULL,
  country         TEXT DEFAULT '',
  message         TEXT DEFAULT '',
  start_iso       TEXT NOT NULL,              -- lesson date/time, ISO 8601 (UTC)
  timezone        TEXT DEFAULT '',             -- visitor's IANA timezone at booking time
  cal_booking_uid TEXT DEFAULT '',             -- Cal.com booking UID, for cross-reference
  status          TEXT NOT NULL DEFAULT 'booked'
                    CHECK (status IN ('booked','completed','cancelled','no_show')),
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS contacts (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  name            TEXT NOT NULL,
  email           TEXT NOT NULL,
  level           TEXT DEFAULT '',
  goal            TEXT DEFAULT '',
  message         TEXT DEFAULT '',
  is_plan_inquiry INTEGER NOT NULL DEFAULT 0,  -- 1 = came from a "pick a plan" checkout, 0 = contact form
  status          TEXT NOT NULL DEFAULT 'new'
                    CHECK (status IN ('new','contacted','closed')),
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS orders (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id        TEXT UNIQUE,                 -- Stripe Checkout Session id (set at checkout start)
  capture_id      TEXT UNIQUE,                 -- Stripe PaymentIntent id (set once paid)
  plan_key        TEXT DEFAULT '',              -- ebi | kani | uni
  plan_name       TEXT DEFAULT '',
  amount          TEXT DEFAULT '',              -- whole yen (JPY is zero-decimal)
  currency        TEXT DEFAULT 'JPY',
  payer_name      TEXT DEFAULT '',
  payer_email     TEXT DEFAULT '',
  status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','completed','refunded','failed','cancelled')),
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_trial_bookings_email ON trial_bookings(email);
CREATE INDEX IF NOT EXISTS idx_trial_bookings_start  ON trial_bookings(start_iso);
CREATE INDEX IF NOT EXISTS idx_contacts_email        ON contacts(email);
CREATE INDEX IF NOT EXISTS idx_orders_email          ON orders(payer_email);
CREATE INDEX IF NOT EXISTS idx_orders_status          ON orders(status);
