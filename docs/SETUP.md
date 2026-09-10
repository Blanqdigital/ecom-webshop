# New store in 10 steps

How to go from this template to a live, selling store. Budget ~1–2 hours of
setup plus however long the storefront copy/images take. Everything integrates
lazily: each feature is dead until its env vars are set, so you can launch with
just Stripe + Supabase and light the rest up later.

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
That creates `orders`, `abandoned_carts`, `funnel_events`, `email_log` (RLS on,
no policies — service-role only). Copy URL + anon key + service-role key into
env.

## 4. Stripe

- API keys → env (`STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`).
- Webhook endpoint → `https://<domain>/api/webhooks/stripe`, subscribed to
  **`checkout.session.completed` AND `payment_intent.succeeded`** — get this
  wrong and orders silently never record. Verify the subscribed events on the
  destination itself, not just that the endpoint exists.
- Signing secret → `STRIPE_WEBHOOK_SECRET`.

## 5. Vercel

Import the repo, paste every var from `.env.example`, deploy.

- Deploy into the **Blanq / team account that owns this store** (pass the right
  `--scope` on the CLI). Do not assume a personal Hobby team from an older
  playbook note.

- **Never add sub-daily crons to `vercel.json` on Hobby** — it silently blocks
  ALL deploys (no deployment records at all). Scheduling lives in GitHub
  Actions instead (already included).
- Env vars snapshot at deploy time: change a var → redeploy.

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

Verify the sending domain, set `RESEND_API_KEY` + `ORDER_FROM` (must be on the
verified domain) + `ORDER_NOTIFY_TO`. Until the domain is verified, Resend is
in test mode and only mails your own address. Send-only domains can't
*receive* — create a real mailbox (or forwarding) for the support address.

## 8. Tracking — paste it in the backend

Log in to `/admin` → **Settings → Tracking** and paste the IDs. No code, no
redeploy — live within ~5 minutes (edge cache):

- **Meta Pixel ID** — browser pixel. All standard events fire from code:
  PageView, ViewContent, AddToCart, InitiateCheckout, and Purchase on /takk.
  Verify with the Meta Pixel Helper extension or Events Manager → Test events
  — never with the "Event Setup Tool" (that's for sites without coded events
  and breaks the page render).
- **Meta Conversions API (optional)** — set `META_CAPI_ACCESS_TOKEN` (and
  optionally `META_CAPI_TEST_EVENT_CODE`) to send server-side events deduped
  with the browser pixel via `event_id`. No-ops until configured.
- **Google tag** — GA4 `G-…`, Ads `AW-…` or `GT-…`.
- **Microsoft Clarity** project ID. Also set `CLARITY_API_TOKEN` in Vercel
  (Clarity → Settings → Data export) to light up the Clarity panel in
  /admin → Insights.

All three no-op while empty. The `NEXT_PUBLIC_*` env vars still work as hard
overrides (the admin field locks when one is set).

## 9. Payments beyond cards (optional)

- **Vipps**: the four `VIPPS_*` vars + `NEXT_PUBLIC_VIPPS_ENABLED=1`. Requires
  the company details from `company.ts` visible on the site for verification.
- **Telegram order alerts**: `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID`
  (message the bot once first; group IDs are negative).

## 10. Fulfilment via Shopify (optional, dropship suppliers)

If the supplier only fulfils through Shopify (e.g. TeamDrop):

1. Import the product into the Shopify store **via the supplier's app** (keeps
   the supplier link).
2. Custom app (Settings → Apps and sales channels → Develop apps) with
   `write_orders` + `read_products` → `shpat_` Admin token → env
   (`SHOPIFY_ADMIN_TOKEN`, `SHOPIFY_STORE_DOMAIN`).
3. Update `SHOPIFY_VARIANT_MAP` + `PRODUCT_GID` in `src/lib/shopify.ts`.
   **Match variants by image, not by name** — supplier variant names lie.
4. Test with `?shopify=testorder`, then cancel the test order in Shopify
   before the supplier ships it.

## Launch checklist

**This whole checklist lives in the backend**: `/admin` → **To-do** → "Load
setup checklist" seeds it into the store's own database, so you can check
items off as you go and add store-specific tasks.

- [ ] Test purchase with Stripe test keys end-to-end: order in admin, both
      customer + owner emails, Telegram ping, (Shopify order if configured)
- [ ] `?orders=1` and `?emails=1` diagnostics return sane data
      (`/api/cron/abandoned-cart?key=<CRON_SECRET>&...`)
- [ ] Swap Stripe to live keys, live webhook, redeploy
- [ ] Real 1 kr test order (refund it after)
- [ ] Legal pages match `company.ts` (vilkår, personvern, angrerett)
- [ ] `grep -ri` for leftover template brand strings
