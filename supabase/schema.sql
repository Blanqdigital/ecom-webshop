-- ============================================================================
-- THE database file. This is ALL the SQL the store needs — nothing else to
-- hunt down. Copy-paste the WHOLE file into the Supabase SQL editor and run.
-- Idempotent (if-not-exists everywhere), so it's always safe to re-run —
-- after pulling new code, run it again and any new tables/columns appear.
-- ============================================================================
-- Everything is written server-side with the service-role key, so Row Level
-- Security stays restrictive: RLS on, no policies, no public access.

create table if not exists public.orders (
  id                 uuid primary key default gen_random_uuid(),
  stripe_session_id  text unique not null,
  email              text,
  customer_name      text,
  phone              text,
  amount_total       numeric(12,2),
  currency           text default 'NOK',
  payment_status     text,
  shipping_address   jsonb,
  items              jsonb,
  fulfillment_status text default 'new',   -- new | processing | shipped | delivered | cancelled
  tracking_number    text,
  admin_note         text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- Safe re-run / upgrade path for databases created from an older schema —
-- recordOrder() fails silently if these columns are missing.
alter table public.orders add column if not exists fulfillment_status text default 'new';
alter table public.orders add column if not exists tracking_number text;
alter table public.orders add column if not exists admin_note text;
alter table public.orders add column if not exists updated_at timestamptz not null default now();

create index if not exists orders_created_at_idx on public.orders (created_at desc);

-- Lock the table down: only the service role (used by the webhook) can touch it.
alter table public.orders enable row level security;
-- No policies = no access for anon/authenticated roles. The service-role key
-- bypasses RLS, so the webhook still writes fine.


-- BÆRA webshop — abandoned-checkout reminders.
-- A row is written (service-role) when a shopper enters their email at /kasse
-- (/api/cart/track). The cron (/api/cron/abandoned-cart) emails carts that are
-- >=30 min old, unconverted and un-reminded; recordOrder() marks a row
-- converted when the matching email pays. One row per email (upsert).

create table if not exists public.abandoned_carts (
  id                uuid primary key default gen_random_uuid(),
  email             text unique not null,
  items             jsonb,
  subtotal          numeric(12,2),
  currency          text default 'NOK',
  consent           boolean not null default false,
  reminder_sent_at  timestamptz,
  reminder2_sent_at timestamptz,   -- second (final) flow email
  converted_at      timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- Upgrade path: the two-step email flow added the final-reminder stamp.
alter table public.abandoned_carts add column if not exists reminder2_sent_at timestamptz;

-- Speeds up the cron's "due" query (oldest eligible carts first).
create index if not exists abandoned_carts_due_idx
  on public.abandoned_carts (updated_at)
  where reminder_sent_at is null and converted_at is null;

-- Same lockdown as orders: service-role only, no public policies.
alter table public.abandoned_carts enable row level security;


-- BÆRA webshop — first-party funnel analytics.
-- Anonymous, cookieless visitor events written server-side (service-role) from
-- /api/analytics for the top of the funnel (PageView, AddToCart,
-- InitiateCheckout). No PII/IP is stored — only a random first-party visitor id
-- (so uniques can be counted later), the event name and the path. Fires for
-- EVERY visitor, independent of the Meta marketing-cookie gate, so the admin
-- funnel reflects all traffic. The Purchase stage is read from the orders
-- table, so it isn't duplicated here.

create table if not exists public.funnel_events (
  id          uuid primary key default gen_random_uuid(),
  visitor_id  text,
  name        text not null,
  path        text,
  value       numeric(12,2),
  currency    text default 'NOK',
  created_at  timestamptz not null default now()
);

create index if not exists funnel_events_created_idx
  on public.funnel_events (created_at desc);
create index if not exists funnel_events_name_created_idx
  on public.funnel_events (name, created_at desc);

-- Same lockdown as orders: service-role only, no public policies.
alter table public.funnel_events enable row level security;


-- BÆRA webshop — outbound email log.
-- Every email the store sends (order confirmations, admin alerts, abandoned-
-- cart reminders) is recorded here by lib/email.ts, including the rendered
-- HTML, so the admin "Marketing" tab can show what was sent and preview it.

create table if not exists public.email_log (
  id          uuid primary key default gen_random_uuid(),
  type        text not null,                 -- order_confirmation | order_admin | cart_reminder
  recipient   text not null,
  subject     text,
  html        text,
  status      text not null default 'sent',  -- sent | failed
  error       text,
  created_at  timestamptz not null default now()
);

create index if not exists email_log_created_idx
  on public.email_log (created_at desc);

-- Same lockdown as orders: service-role only, no public policies.
alter table public.email_log enable row level security;


-- Store settings — key/value pairs editable from the admin:
--   Settings tab  → tracking IDs (Meta pixel, Google tag, Clarity project)
--   Integrations  → API secrets + payment/email/config (Stripe, Resend, Vipps, …)
-- Read server-side with the service-role key only (RLS on, no policies).
-- Env vars with the same meaning always take precedence over DB values.
-- Bootstrap secrets (Supabase, ADMIN_EMAILS, CRON_SECRET, STRIPE_WEBHOOK_SECRET,
-- EMAIL_UNSUB_SECRET, BLANQ_METRICS_TOKEN) stay in host env — never in this table.

-- Discount coupons — created/managed from the admin (Marketing tab). Applied
-- at checkout by code; a 100% coupon routes through the free-order flow
-- (Stripe/Vipps can't charge 0).

create table if not exists public.coupons (
  id          uuid primary key default gen_random_uuid(),
  code        text unique not null,          -- stored uppercase
  percent_off integer not null check (percent_off between 1 and 100),
  active      boolean not null default true,
  expires_at  timestamptz,
  created_at  timestamptz not null default now()
);

-- Same lockdown as orders: service-role only, no public policies.
alter table public.coupons enable row level security;


create table if not exists public.store_settings (
  key         text primary key,
  value       text,
  updated_at  timestamptz not null default now()
);

-- Same lockdown as orders: service-role only, no public policies.
alter table public.store_settings enable row level security;


-- Store to-dos — the setup/launch checklist managed from the admin "To-do"
-- tab. Seeded with the standard new-store checklist on first use.

create table if not exists public.store_todos (
  id          uuid primary key default gen_random_uuid(),
  label       text not null,
  done        boolean not null default false,
  sort        integer not null default 0,
  created_at  timestamptz not null default now(),
  done_at     timestamptz
);

create index if not exists store_todos_sort_idx on public.store_todos (sort, created_at);

-- Same lockdown as orders: service-role only, no public policies.
alter table public.store_todos enable row level security;
