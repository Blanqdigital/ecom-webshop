export type IntegrationKey =
  | "stripe_secret_key"
  | "stripe_publishable_key"
  | "vipps_client_id"
  | "vipps_client_secret"
  | "vipps_subscription_key"
  | "vipps_msn"
  | "vipps_env"
  | "vipps_enabled"
  | "resend_api_key"
  | "order_from"
  | "order_notify_to"
  | "telegram_bot_token"
  | "telegram_chat_id"
  | "shopify_admin_token"
  | "shopify_store_domain"
  | "shopify_webhook_secret"
  | "order_token_secret"
  | "post_purchase_token_secret"
  | "clarity_api_token"
  | "sale_ends_at";

export type Field = {
  key: IntegrationKey;
  label: string;
  placeholder?: string;
  hint?: string;
  type?: "text" | "password" | "select" | "toggle";
  options?: { value: string; label: string }[];
};

export const SECRET_KEYS = new Set<IntegrationKey>([
  "stripe_secret_key",
  "resend_api_key",
  "telegram_bot_token",
  "telegram_chat_id",
  "vipps_client_id",
  "vipps_client_secret",
  "vipps_subscription_key",
  "vipps_msn",
  "shopify_admin_token",
  "shopify_webhook_secret",
  "order_token_secret",
  "post_purchase_token_secret",
  "clarity_api_token",
]);

export const GROUPS: { title: string; blurb: string; fields: Field[] }[] = [
  {
    title: "Payments - Stripe",
    blurb: "Secret key stays server-only. Publishable key is exposed via /api/site-config for checkout.",
    fields: [
      { key: "stripe_secret_key", label: "Stripe secret key", placeholder: "sk_live_... or sk_test_...", hint: "Dashboard -> Developers -> API keys." },
      { key: "stripe_publishable_key", label: "Stripe publishable key", placeholder: "pk_live_... or pk_test_...", hint: "Safe to expose - used by Stripe.js on /kasse." },
    ],
  },
  {
    title: "Payments - Vipps",
    blurb: "All four credentials required. Toggle enables the Vipps button on checkout (no redeploy).",
    fields: [
      { key: "vipps_enabled", label: "Show Vipps at checkout", type: "toggle", hint: 'Stores "1" when enabled.' },
      { key: "vipps_client_id", label: "Client ID", placeholder: "..." },
      { key: "vipps_client_secret", label: "Client secret", placeholder: "..." },
      { key: "vipps_subscription_key", label: "Subscription key", placeholder: "..." },
      { key: "vipps_msn", label: "Merchant serial number (MSN)", placeholder: "..." },
      { key: "vipps_env", label: "Environment", type: "select", options: [{ value: "test", label: "test" }, { value: "production", label: "production" }] },
    ],
  },
  {
    title: "Email - Resend",
    blurb: "Order confirmations + admin alerts. From must be on a verified Resend domain.",
    fields: [
      { key: "resend_api_key", label: "Resend API key", placeholder: "re_..." },
      { key: "order_from", label: "From address", placeholder: "YOUR BRAND <ordre@yourshop.example>" },
      { key: "order_notify_to", label: "Notify admin at", placeholder: "hei@yourshop.example", hint: "Defaults to company support email when empty." },
    ],
  },
  {
    title: "Telegram",
    blurb: "Instant order pings. Message the bot once, then paste chat id from getUpdates.",
    fields: [
      { key: "telegram_bot_token", label: "Bot token", placeholder: "123456:ABC..." },
      { key: "telegram_chat_id", label: "Chat ID", placeholder: "-100... or 123..." },
    ],
  },
  {
    title: "Shopify fulfilment",
    blurb: "Dropship sync + fulfilment webhooks. Also fill SHOPIFY_VARIANT_MAP in src/lib/shopify-core-a.ts (match by image).",
    fields: [
      { key: "shopify_admin_token", label: "Admin API token", placeholder: "shpat_..." },
      { key: "shopify_store_domain", label: "Store domain", placeholder: "your-store.myshopify.com" },
      { key: "shopify_webhook_secret", label: "Webhook HMAC secret", placeholder: "shpss_... or API secret", hint: "Verifies FULFILLMENTS_CREATE / UPDATE. Env: SHOPIFY_WEBHOOK_SECRET / SHOPIFY_API_SECRET." },
    ],
  },
  {
    title: "Order & post-purchase tokens",
    blurb: "HMAC secrets for /ordre and /tilbud links. Leave unset to disable those flows.",
    fields: [
      { key: "order_token_secret", label: "Order status token secret", placeholder: "long random string", hint: "Signs /ordre/[token] links in confirmation emails." },
      { key: "post_purchase_token_secret", label: "Post-purchase offer token secret", placeholder: "long random string", hint: "Signs /tilbud offer tokens after card checkout." },
    ],
  },
  {
    title: "Microsoft Clarity API",
    blurb: "Powers the Clarity panel in Insights (Data export token).",
    fields: [{ key: "clarity_api_token", label: "Clarity API token", placeholder: "..." }],
  },
  {
    title: "Sale window",
    blurb: "Gates abandoned-cart reminders when the sale has ended.",
    fields: [
      { key: "sale_ends_at", label: "Sale ends at (ISO 8601)", placeholder: "2026-09-30T23:59:59+02:00", hint: "Empty = sale always live." },
    ],
  },
];
