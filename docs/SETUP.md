# Set up a store

Read [STORE-WORKFLOW.md](STORE-WORKFLOW.md) first. This repository is a neutral
starter, not a ready-to-sell BÆRA storefront. Checkout and promotions default
to disabled in `src/lib/commerce.ts`; public pages are noindex policy drafts.

## Bootstrap

1. Create the store repository under the intended GitHub owner from a tested
   framework revision. Use the complete repository, not copied individual files.
2. Create a separate Supabase project. Have the operator run `supabase/schema.sql`
   in that project's SQL editor; the application does not apply migrations.
3. Set NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
   SUPABASE_SERVICE_ROLE_KEY, ADMIN_EMAILS and INTEGRATIONS_ENCRYPTION_KEY in
   the hosting environment. The encryption key is 32 random bytes encoded as
   64 hex characters. Generate it locally and keep it in a password manager.
4. Set CRON_SECRET, STRIPE_WEBHOOK_SECRET and EMAIL_UNSUB_SECRET independently
   when configuring those endpoints. Configure the Stripe webhook for
   checkout.session.completed, checkout.session.async_payment_succeeded and
   payment_intent.succeeded. Its URL is /api/webhooks/stripe.
5. Create the admin user in Supabase Auth using an email in ADMIN_EMAILS.
   Deploy, visit /admin and sign in. Account creation alone never grants admin.

## Admin configuration

Use Integrations for Stripe, Vipps, Resend, Telegram, Shopify, signed order
links and post-purchase links. Environment values override database values.
Secret saves require the encryption key; values are encrypted with AES-256-GCM
before database storage. Tracking IDs remain in Settings. Meta Pixel is supported;
server-side Meta Conversions API is not included.

Save first, then use connection checks. Stripe checks API access and mode;
Shopify checks shop access; Telegram checks bot identity without sending a
message. None proves a complete payment, webhook or delivery. Resend sender
domain verification and Vipps checkout must be tested separately.

Inventory counts are under Products. Configure Shopify with the exact
`your-store.myshopify.com` domain, Admin API token, webhook signing secret and
variant map in `src/lib/shopify-core-a.ts`. Verify imported variants by image
and SKU. Register fulfilment webhooks using the admin panel only after setting
the real canonical URL. Supplier purchasing is not part of setup.

Enable welcome/abandoned-cart timings deliberately under Marketing after
reviewing the actual store's messages. Set GitHub Actions variable SITE_URL and
secret CRON_SECRET for scheduling. The cron accepts a bearer token only; old
query-string debug/send/delete shortcuts have been removed.

## Build and launch

Replace company.ts, site.ts, products.ts, offers.ts, storefront components,
assets and policy drafts from the store brief. The sample product is not for
sale. The framework does not imply free products, a 90-day guarantee, supplier
stock, reviews or certifications. Re-enable indexing and populate the sitemap
only for the finished store.

Run npm ci, npm test, npx tsc --noEmit and npm run build. Complete the launch
gates in STORE-WORKFLOW.md. Enable checkout only once required configuration
and seller details are verified. Enable optional promotions separately.

For existing installations, re-enter legacy plaintext secrets to encrypt them.
No schema change is required for encrypted text values in store_settings.
Changing the encryption key without re-encrypting values breaks decryption.
The complete schema still needs to exist before using inventory and tracking.
