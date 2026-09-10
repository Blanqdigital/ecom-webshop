import "server-only";
import { getIntegration } from "./integrations";
import { COMMERCE } from "./commerce";

import { createHmac, timingSafeEqual } from "crypto";
import type Stripe from "stripe";
import { bumpCompareAtNok, bumpUnitPriceNok, ORDER_BUMP } from "./offers";
import { getStripe } from "./stripe";
import { getProduct, PRODUCTS } from "./products";

const OFFER_WINDOW_SECONDS = 2 * 60 * 60;

/**
 * Sample post-purchase offer config. Uses the first catalogue product (and the
 * order-bump slug when different). Empty / missing secrets make the feature
 * no-op. Replace discountPercent / colorId per store.
 */
function buildOfferConfig(): Record<
  string,
  { colorId: string; discountPercent: number; kind: "bump" | "extra" }
> {
  if (!COMMERCE.postPurchaseEnabled) return {};
  const sample = PRODUCTS[0];
  if (!sample?.colors[0]) return {};
  const config: Record<
    string,
    { colorId: string; discountPercent: number; kind: "bump" | "extra" }
  > = {
    [sample.slug]: {
      colorId: sample.colors[0].id,
      discountPercent: 40,
      kind: "extra",
    },
  };
  if (ORDER_BUMP.slug !== sample.slug) {
    // Order bump product as an alternate one-click add-on when distinct.
    const bump = getProduct(ORDER_BUMP.slug);
    if (bump?.colors[0]) {
      config[ORDER_BUMP.slug] = {
        colorId: bump.colors[0].id,
        discountPercent: ORDER_BUMP.discountPct,
        kind: "bump",
      };
    }
  }
  return config;
}

export type PostPurchaseOfferSlug = string;

async function tokenSecret(): Promise<string> {
  const value = (
    (await getIntegration("post_purchase_token_secret")) ||
    (await getIntegration("order_token_secret")) ||
    process.env.EMAIL_UNSUB_SECRET?.trim() ||
    process.env.CRON_SECRET?.trim() ||
    process.env.STRIPE_WEBHOOK_SECRET?.trim() ||
    ""
  );
  return value.replace(/[^\x21-\x7e]/g, "");
}

async function sign(reference: string): Promise<string> {
  return createHmac("sha256", await tokenSecret())
    .update(`post-purchase:${reference}`)
    .digest("base64url")
    .slice(0, 24);
}

async function offerToken(reference: string): Promise<string> {
  return `${Buffer.from(reference).toString("base64url")}.${await sign(reference)}`;
}

async function readOfferToken(token: string): Promise<string | null> {
  const dot = token.lastIndexOf(".");
  if (!(await tokenSecret()) || dot <= 0) return null;
  try {
    const reference = Buffer.from(token.slice(0, dot), "base64url").toString("utf8");
    const supplied = token.slice(dot + 1);
    const expected = await sign(reference);
    if (!reference || supplied.length !== expected.length) return null;
    return timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))
      ? reference
      : null;
  } catch {
    return null;
  }
}

export interface PostPurchaseOfferOption {
  slug: string;
  colorId: string;
  price: number;
  compareAt: number;
  discountPercent: number;
  name: string;
  body: string;
  image: string;
}

export interface PostPurchaseOffer {
  token: string;
  offers: PostPurchaseOfferOption[];
}

function cartLines(cartRaw: string | undefined): { slug?: string; colorId?: string }[] {
  try {
    return JSON.parse(cartRaw ?? "[]") as { slug?: string; colorId?: string }[];
  } catch {
    return [];
  }
}

function cartHas(cartRaw: string | undefined, slug: string): boolean {
  return cartLines(cartRaw).some((line) => line.slug === slug);
}

function originalColor(cartRaw: string | undefined, slug: string, fallback: string): string {
  return cartLines(cartRaw).find((line) => line.slug === slug)?.colorId || fallback;
}

function id(value: string | { id: string } | null): string | null {
  return typeof value === "string" ? value : value?.id ?? null;
}

function isRecent(pi: Stripe.PaymentIntent): boolean {
  return pi.created >= Math.floor(Date.now() / 1000) - OFFER_WINDOW_SECONDS;
}

function shippingFrom(
  shipping: Stripe.PaymentIntent.Shipping | null,
): Stripe.PaymentIntentCreateParams.Shipping | undefined {
  const address = shipping?.address;
  if (!shipping?.name || !address) return undefined;
  return {
    name: shipping.name,
    phone: shipping.phone ?? undefined,
    carrier: shipping.carrier ?? undefined,
    tracking_number: shipping.tracking_number ?? undefined,
    address: {
      line1: address.line1 ?? "",
      line2: address.line2 ?? undefined,
      city: address.city ?? undefined,
      state: address.state ?? undefined,
      postal_code: address.postal_code ?? undefined,
      country: address.country ?? undefined,
    },
  };
}

function offerPrice(slug: string, kind: "bump" | "extra"): number {
  if (kind === "bump") return bumpUnitPriceNok();
  const product = getProduct(slug);
  return product ? Math.round(product.priceNok * 0.6) : 0;
}

function offerCompareAt(slug: string, kind: "bump" | "extra"): number {
  if (kind === "bump") return bumpCompareAtNok();
  return getProduct(slug)?.priceNok ?? 0;
}

/** Returns an offer only when configured and the original payment can be reused. */
export async function getPostPurchaseOffer(
  paymentIntentId?: string,
): Promise<PostPurchaseOffer | null> {
  const config = buildOfferConfig();
  if (!paymentIntentId || !(await tokenSecret()) || Object.keys(config).length === 0) {
    return null;
  }
  try {
    const pi = await (await getStripe()).paymentIntents.retrieve(paymentIntentId, {
      expand: ["payment_method"],
    });
    const paymentMethod =
      typeof pi.payment_method === "object" ? pi.payment_method : null;
    if (
      pi.status !== "succeeded" ||
      !isRecent(pi) ||
      !id(pi.customer) ||
      paymentMethod?.type !== "card" ||
      pi.metadata?.upsell_for ||
      pi.metadata?.upsell_completed
    ) {
      return null;
    }

    const offers: PostPurchaseOfferOption[] = [];
    for (const [slug, cfg] of Object.entries(config)) {
      if (cfg.kind === "bump" && cartHas(pi.metadata?.cart, slug)) continue;
      const product = getProduct(slug);
      if (!product) continue;
      const colorId =
        cfg.kind === "extra"
          ? originalColor(pi.metadata?.cart, slug, cfg.colorId)
          : cfg.colorId;
      const color = product.colors.find((c) => c.id === colorId) ?? product.colors[0];
      offers.push({
        slug,
        colorId: color?.id ?? cfg.colorId,
        price: offerPrice(slug, cfg.kind),
        compareAt: offerCompareAt(slug, cfg.kind),
        discountPercent: cfg.discountPercent,
        name: product.name,
        body:
          cfg.kind === "bump"
            ? "Legg til tilbudet med ett klikk — samme kort, ingen ny utsjekk."
            : "En ekstra enhet i samme farge, til partneren, bilen eller som gave.",
        image: color?.image ?? product.colors[0]?.image ?? "",
      });
    }
    if (offers.length === 0) return null;
    return { token: await offerToken(pi.id), offers };
  } catch {
    return null;
  }
}

export interface UpsellChargeResult {
  status: "succeeded" | "requires_action";
  clientSecret?: string;
}

export async function chargePostPurchaseOffer(
  token: string,
  offerSlug: string,
): Promise<UpsellChargeResult> {
  const config = buildOfferConfig();
  const originalId = await readOfferToken(token);
  if (!originalId?.startsWith("pi_") || !config[offerSlug]) {
    throw new Error("invalid_offer");
  }

  const stripe = await getStripe();
  const original = await stripe.paymentIntents.retrieve(originalId, {
    expand: ["payment_method"],
  });
  const paymentMethod =
    typeof original.payment_method === "object"
      ? original.payment_method
      : null;
  const customerId = id(original.customer);
  const cfg = config[offerSlug];
  if (
    original.status !== "succeeded" ||
    !isRecent(original) ||
    !customerId ||
    paymentMethod?.type !== "card" ||
    (cfg.kind === "bump" && cartHas(original.metadata?.cart, offerSlug)) ||
    original.metadata?.upsell_for ||
    original.metadata?.upsell_completed
  ) {
    throw new Error("offer_unavailable");
  }

  const colorId =
    cfg.kind === "extra"
      ? originalColor(original.metadata?.cart, offerSlug, cfg.colorId)
      : cfg.colorId;
  const amount = offerPrice(offerSlug, cfg.kind) * 100;
  const cart = JSON.stringify([
    { slug: offerSlug, colorId, qty: 1, bump: true },
  ]);
  const paymentIntent = await stripe.paymentIntents.create(
    {
      amount,
      currency: original.currency,
      customer: customerId,
      payment_method: paymentMethod.id,
      confirm: true,
      use_stripe_sdk: true,
      receipt_email: original.receipt_email ?? undefined,
      shipping: shippingFrom(original.shipping),
      metadata: {
        cart,
        lang: "nb",
        upsell_for: original.id,
        offer: offerSlug,
      },
    },
    { idempotencyKey: `post_purchase_offer_${original.id}` },
  );

  if (paymentIntent.status === "succeeded") {
    await stripe.paymentIntents
      .update(original.id, { metadata: { upsell_completed: paymentIntent.id } })
      .catch(() => undefined);
    return { status: "succeeded" };
  }
  if (paymentIntent.status === "requires_action" && paymentIntent.client_secret) {
    return {
      status: "requires_action",
      clientSecret: paymentIntent.client_secret,
    };
  }
  throw new Error("payment_failed");
}
