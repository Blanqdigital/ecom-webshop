import { getProduct } from "./products";
import { ORDER_BUMP, bumpUnitPriceNok } from "./offers";
import { COMMERCE } from "./commerce";

// Shared server-side cart pricing. Both checkout backends (Stripe Payment
// Element and Vipps ePayment) price the cart HERE from the catalogue — client
// amounts are never trusted — so the two flows can never diverge on price.

export interface PriceReqItem {
  slug: string;
  colorId: string;
  qty: number;
  free?: boolean;
}

export interface PricedCart {
  /** Total in minor units (øre). */
  amountOre: number;
  /** Normalised line items for metadata. */
  cartMeta: { slug: string; colorId: string; qty: number; bump?: boolean }[];
}

/** Optional pre-purchase order bump (one discounted extra unit). */
export interface BumpInput {
  colorId: string;
}

/** Normalise an optional order-bump payload from a checkout request body. */
export function parseBump(v: unknown): BumpInput | null {
  if (
    v &&
    typeof v === "object" &&
    typeof (v as { colorId?: unknown }).colorId === "string"
  ) {
    return { colorId: (v as { colorId: string }).colorId };
  }
  return null;
}

/** Thrown on an invalid cart; carries the HTTP status the route should return. */
export class PricingError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

const clampQty = (q: number) =>
  Math.max(1, Math.min(99, Math.floor(Number(q) || 0)));

/**
 * Price a cart from the SERVER catalogue, applying the BOGO free-unit
 * allowance (each paid unit backs one free unit; unbacked free units fall
 * through as paid). Throws PricingError on an empty or invalid cart.
 */
export function priceCart(
  items: PriceReqItem[],
  bump?: BumpInput | null,
): PricedCart {
  if (!Array.isArray(items) || items.length === 0 || items.length > 20) {
    throw new PricingError("Handlekurven er tom.");
  }

  const freeAllowance = new Map<string, number>();
  for (const it of items) {
    if (!it || typeof it !== "object" || !Number.isInteger(it.qty) || it.qty < 1 || it.qty > 99) {
      throw new PricingError("Ugyldig antall i handlekurven.");
    }
    if (!it.free && COMMERCE.bogoSlugs.includes(it.slug)) {
      freeAllowance.set(it.slug, (freeAllowance.get(it.slug) ?? 0) + it.qty);
    }
  }

  let amountOre = 0;
  const cartMeta: PricedCart["cartMeta"] = [];

  for (const it of items) {
    const product = getProduct(it.slug);
    const color = product?.colors.find((c) => c.id === it.colorId);
    const qty = clampQty(it.qty);
    if (!product || !color) {
      throw new PricingError("Et produkt i handlekurven finnes ikke.");
    }

    if (it.free) {
      const granted = Math.min(qty, freeAllowance.get(it.slug) ?? 0);
      freeAllowance.set(it.slug, (freeAllowance.get(it.slug) ?? 0) - granted);
      const remainder = qty - granted;
      if (remainder > 0) amountOre += product.priceNok * 100 * remainder;
    } else {
      amountOre += product.priceNok * 100 * qty;
    }
    cartMeta.push({ slug: product.slug, colorId: color.id, qty });
  }

  // Order bump: append one discounted extra unit to the same payment. A bad
  // colour is ignored (never fail the whole checkout over the add-on).
  if (bump && COMMERCE.orderBumpEnabled) {
    const product = getProduct(ORDER_BUMP.slug);
    const color = product?.colors.find((c) => c.id === bump.colorId);
    if (product && color) {
      amountOre += bumpUnitPriceNok() * 100;
      cartMeta.push({ slug: product.slug, colorId: color.id, qty: 1, bump: true });
    }
  }

  if (amountOre <= 0) throw new PricingError("Ugyldig handlekurv.");
  if (JSON.stringify(cartMeta).length > 480) throw new PricingError("For mange varianter i handlekurven.");
  return { amountOre, cartMeta };
}
