// Free-shipping threshold in NOK. Kept in sync with the storefront copy
// ("Fri frakt over 500 kr") and the salgsvilkår page. Change in one place.
export const FREE_SHIPPING_THRESHOLD = 0;

/** Progress (0-1) toward free shipping for a given subtotal. */
export function freeShippingProgress(subtotal: number): number {
  if (FREE_SHIPPING_THRESHOLD <= 0) return 1;
  return Math.max(0, Math.min(1, subtotal / FREE_SHIPPING_THRESHOLD));
}

/** Amount still needed (NOK) to reach free shipping; 0 once reached. */
export function amountToFreeShipping(subtotal: number): number {
  return Math.max(0, FREE_SHIPPING_THRESHOLD - subtotal);
}
