# Store creation and release workflow

The framework owns commerce operations. Each store owns its product facts,
commercial rules and storefront design. BÆRA is a feature reference, never a
default seller, product, promotion or testimonial source.

## 1. Use a tested framework revision

Work from a clean clone of Blanqdigital/ecom-webshop. Run `npm ci`, `npm test`,
`npx tsc --noEmit` and `npm run build`. Record the source commit in the new
store's `docs/STORE-BRIEF.md`. GitHub validation must pass before using a release.
Create the destination under C:\dev and verify the remote before pushing.
Never transfer files piecemeal through GitHub's web editor.

## 2. Write the store brief

Record the brand, registered seller, market, currency, exact supplier product
and variants, source URLs, retrieval date, product cost, shipping cost and
displayed total separately. Supplier quotes are not verified landed costs.
Record supported product claims and the source for each. Do not transfer
competitor reviews, certifications, guarantees or delivery promises.

Capture the design direction before implementing pages: typography, palette,
image treatment, purchase panel, mobile layout and section sequence. References
explain what works; the store's design is not inherited from the sample shell.
Check whether existing ads rely on the current headline before rewriting it.

## 3. Bootstrap one isolated store

Create its database and have the operator run `supabase/schema.sql`. Do not
reuse another shop's database, credentials, seller details or Shopify mappings.
Configure the Supabase URL, anon key, service-role key, ADMIN_EMAILS and
INTEGRATIONS_ENCRYPTION_KEY in hosting. Create the named admin in Supabase Auth.
Set independent webhook/cron secrets as described in SETUP.md.

Enter provider keys in Admin > Integrations. Saved is not connected. Use the
read-only connection checks, then perform separate checkout and webhook tests.
Old plaintext settings remain readable for compatibility; re-enter and save
them to encrypt. Preserve the encryption key in a password manager. Replacing
it without re-encrypting settings makes existing values unreadable.

## 4. Configure and build the store

- `src/lib/company.ts`: verified seller and contact details.
- `src/lib/site.ts`: canonical URL and market metadata.
- `src/lib/products.ts`: catalogue, real owned/licensed images and descriptions.
- `src/lib/commerce.ts`: explicit checkout and promotion switches. All default off.
- `src/lib/offers.ts`: optional offer prices and copy.
- `src/lib/shopify-core-a.ts`: store-specific variant map, verified by image/SKU.
- `src/app` and `src/components/store`: original storefront and actual policies.

The starter is intentionally noindex, with an empty sitemap and policy drafts.
Replace these deliberately for a finished store. The sample has free shipping;
any shipping charge must be implemented identically in all payment paths.
Inventory is a physical-count estimate with backorder notices, not a supplier
stock feed or an atomic stock reservation system.

## 5. Release gates

Verify mobile and desktop selection, quantities, cart totals and error states.
Use provider test mode to check payment, signed webhook, saved order, duplicate
delivery, inventory, confirmation and order-status links. Verify Shopify
variant mapping and tracking updates without placing a supplier purchase.
Enable post-purchase charging only after its test flow works.

Record evidence separately for code checks, deployment completion and production
browser checks. A successful build is not proof of payments or fulfilment.
Keep checkout disabled while seller details, schema, credentials or provider
verification are missing. Do not send customer messages or supplier orders as
part of setup without explicit authorization.

## Current operational limits

Payment persistence failures now propagate for webhook retries, and duplicate
order inserts are arbitrated by the database's unique provider reference.
Downstream email and Shopify delivery are still best-effort: a crash after
persistence requires admin reconciliation/resync. There is no durable delivery
queue with automatic recovery yet. Connection checks cover Stripe API access,
Shopify access and Telegram bot credentials; they do not prove delivery or
payment key pairing. Treat these as explicit launch checks, not completed tests.
