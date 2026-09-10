# New store in 10 steps

How to go from this template to a live, selling store. Budget ~1–2 hours of
setup plus however long the storefront copy/images take. Everything integrates
lazily: each feature is dead until its secret is set (host env **or**
Admin → Integrations), so you can launch with just Supabase bootstrap + Stripe
and light the rest up later.

For the full war stories behind these steps (what broke and why), read
[PLAYBOOK.md](./PLAYBOOK.md).

## 1. Create the repo

Use this template on GitHub ("Use this template" → new repo), clone it, and
`npm install`.

## 2. Brand & product — the only real editing work

| File | What |
|---|---|
| `src/lib/company.ts` | Brand name, legal entity, org.nr, address, support email/phone, canonical URL. **Marked EDIT FIRST.** |
| `src/lib/site.ts` | Canonical site URL, brand name, language / country / currency for SEO. |
| `src/lib/products.ts` | Product(s), colours/variants, prices, images. Ships as a **sample** catalogue. |
| `src/lib/offers.ts` | Order bump / BOGO offer config (sample). |
| `public/images/` | Replace all product + explainer images. |
| Storefront copy | Homepage, product page, FAQ, emails — per-store work; the template ships the Norwegian single-product example. |

**Write the storefront per [methodology/LANDING-PAGE.md](methodology/LANDING-PAGE.md)** —
image-carousel cadence, headline formula (outcome + timeframe + mechanism,
≥4/7 checklist), benefit bullets, offer tiers, section order, FAQ sourcing.
Don't freestyle the page structure.

Grep for leftover placeholders before launch:
`grep -ri "yourshop\\|YOUR BRAND\\|yourbrand" src/` should only hit intentional
samples you still need to replace.

## 3. Supabase

New project → SQL editor → paste **all of `supabase/schema.sql`** → run.
That creates `orders`, `abandoned_carts`, `funnel_events`, `email_log`,
`store_settings`, `app_settings`, `store_todos`, `coupons` (RLS on, no policies — service-role
only). Copy URL + anon key + service-role key into env.

## 4. Bootstrap env → deploy → Admin Integrations

**Host env only needs a handful of bootstrap vars** (these never move to the DB):

| Var | Why |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` | Auth + DB |
| `ADMIN_EMAILS` | Who can open `/admin` |
| `CRON_SECRET` | Abandoned-cart + weekly report crons |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signature verification |
| Optional: `EMAIL_UNSUB_SECRET`, `BLANQ_METRICS_TOKEN`, `NEXT_PUBLIC_SITE_URL` | Unsubscribe HMAC, metrics feed, canonical URL |

Deploy to Vercel with those set. Then sign in to `/admin` → **Integrations** and
paste Stripe / Resend / Vipps / Telegram / Shopify / Meta CAPI / Clarity API
tokens. Env vars still win as hard overrides (admin fields lock when set).

**Stripe webhook** (still required in the Stripe Dashboard):

- Endpoint → `https://<domain>/api/webhooks/stripe`
- Events: **`checkout.session.completed` AND `payment_intent.succeeded`**
- Signing secret → `STRIPE_WEBHOOK_SECRET` (bootstrap env)

## 5. Vercel

Import the repo, paste bootstrap vars (and any env overrides you want), deploy.

- Deploy into the **Blanq / team account that owns this store** (pass the right
  `--scope` on the CLI). Do not assume a personal Hobby team from an older
  playbook note.

- **Never add sub-daily crons to `vercel.json` on Hobby** — it silently blocks
  ALL deploys (no deployment records at all). Scheduling lives in GitHub
  Actions instead (already included).
- Env vars snapshot at deploy time: change a **bootstrap** var → redeploy.
  Integrations pasted in admin apply without redeploy (~60s cache).

## 6. GitHub Actions (crons)

The two workflows (`abandoned-cart` every 15 min, `weekly-report` Fridays)
need, per repo:

```
gh variable set SITE_URL    --body "https://www.yourshop.example"
gh secret   set CRON_SECRET --body "<same value as the Vercel CRON_SECRET>"
```

Actions run on pushes automatically; check the Actions tab shows green after
the first scheduled run.

## 7. Email (Resend)

Verify the sending domain, then set Resend API key + `ORDER_FROM` (must be on
the verified domain) + `ORDER_NOTIFY_TO` in **Admin → Integrations** (or env).
Until the domain is verified, Resend is in test mode and only mails your own
address. Send-only domains can't *receive* — create a real mailbox (or
forwarding) for the support address.

## 8. Tracking — paste it in the backend

Log in to `/admin` → **Settings → Tracking** and paste the IDs. No code, no
redeploy — live within ~5 minutes (edge cache):

- **Meta Pixel ID** — browser pixel. All standard events fire from code:
  PageView, ViewContent, AddToCart, InitiateCheckout, and Purchase on /takk.
  Verify with the Meta Pixel Helper extension or Events Manager → Test events
  — never with the "Event Setup Tool" (that's for sites without coded events
  and breaks the page render).
- **Meta Conversions API (optional)** — paste access token (and optional test
  event code) in **Admin → Integrations**. No-ops until configured.
- **Google tag** — GA4 `G-…`, Ads `AW-…` or `GT-…`.
- **Microsoft Clarity** project ID in Settings. Also paste Clarity API token
  in Integrations (Clarity → Settings → Data export) for /admin → Insights.

All three no-op while empty. The `NEXT_PUBLIC_*` env vars still work as hard
overrides (the admin field locks when one is set).

## 9. Payments beyond cards (optional)

- **Vipps**: paste the four credentials in Integrations and flip the Vipps
  toggle (or set `NEXT_PUBLIC_VIPPS_ENABLED=1`). Requires the company details
  from `company.ts` visible on the site for verification.
- **Telegram order alerts**: bot token + chat id in Integrations
  (message the bot once first; group IDs are negative).

## 10. Inventory (soft stock)

In `/admin` → **Products**, enter physical on-hand counts per variant. Paid
orders after each count deduct automatically (`app_settings.product_inventory_v1`).
Zero stock stays purchasable; the storefront shows an extra-delivery notice.

## 11. Fulfilment via Shopify (optional, dropship suppliers)

If the supplier only fulfils through Shopify (e.g. TeamDrop):

1. Import the product into the Shopify store **via the supplier's app** (keeps
   the supplier link).
2. Custom app (Settings → Apps and sales channels → Develop apps) with
   `write_orders` + `read_products` → `shpat_` Admin token → Integrations
   (token + store domain).
3. Update `SHOPIFY_VARIANT_MAP` + `PRODUCT_GID` in `src/lib/shopify.ts`.
   **Match variants by image, not by name** — supplier variant names lie.
4. Paste **Shopify webhook secret** (custom app API secret) in Integrations
   (or `SHOPIFY_WEBHOOK_SECRET` / `SHOPIFY_API_SECRET` env).
5. In Integrations → **Register webhooks** (or POST `/api/admin/shopify-webhooks`)
   so FULFILLMENTS_CREATE/UPDATE hit `/api/webhooks/shopify`.
6. Test with `?shopify=testorder`, then cancel the test order in Shopify
   before the supplier ships it.

### Post-purchase / order status

- Set `ORDER_TOKEN_SECRET` (or Integrations) so confirmation emails link to
  `/ordre/<token>` status pages.
- Optional one-click upsell at `/tilbud` after card checkout — set
  `POST_PURCHASE_TOKEN_SECRET`; no-ops until configured. Sample offer uses
  the first product in `products.ts`.
- Welcome email delay is editable under Admin → Marketing (runs in the
  abandoned-cart cron).

## Launch checklist

**This whole checklist lives in the backend**: `/admin` → **To-do** → "Load
setup checklist" seeds it into the store's own database, so you can check
items off as you go and add store-specific tasks.

- [ ] Test purchase with Stripe test keys end-to-end: order in admin, both
      customer + owner emails, Telegram ping, (Shopify order if configured)
- [ ] `?orders=1` and `?emails=1` diagnostics return sane data
      (`/api/cron/abandoned-cart?key=<CRON_SECRET>&...`)
- [ ] Swap Stripe to live keys (Integrations or env), live webhook, redeploy if
      webhook secret changed
- [ ] Real 1 kr test order (refund it after)
- [ ] Legal pages match `company.ts` (vilkår, personvern, angrerett)
- [ ] `grep -ri` for leftover template brand strings
