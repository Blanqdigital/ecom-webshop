# ecom-webshop

Reusable commerce infrastructure with a neutral Norwegian sample storefront.
Next.js, TypeScript, Tailwind, Supabase, Stripe/Vipps, admin inventory,
Shopify fulfilment webhooks and optional post-purchase flows.

Start with [the store workflow](docs/STORE-WORKFLOW.md), then follow
[setup](docs/SETUP.md) and fill out [a store brief](docs/STORE-BRIEF.template.md).

The framework does not choose a store's design or commercial offer. Each store
gets its own product evidence, seller, assets, policies and storefront.
Checkout and promotions are disabled by default. Sample pages are noindex.

Admin Integrations stores encrypted secrets, supports environment overrides,
and includes read-only checks for Stripe, Shopify and Telegram. Connection
checks are not proof of complete payments or message delivery.

## Development

```sh
npm ci
npm test
npx tsc --noEmit
npm run build
npm run dev
```

GitHub runs tests, typecheck and production build on pushes and pull requests.
Do not call a store launched until its actual production buying flow is tested.
See the workflow's current operational limits for delivery recovery boundaries.

The [landing-page methodology](docs/methodology/LANDING-PAGE.md) is a reference
for purchase clarity, not a requirement to copy an existing store's design.
PLAYBOOK.md retains historical context; current setup and workflow take precedence.
