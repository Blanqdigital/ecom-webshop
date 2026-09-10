/** Per-store commercial rules. Promotions must be explicitly enabled here. */
export const COMMERCE: {
  checkoutEnabled: boolean;
  bogoSlugs: readonly string[];
  orderBumpEnabled: boolean;
  postPurchaseEnabled: boolean;
} = {
  checkoutEnabled: false,
  bogoSlugs: [],
  orderBumpEnabled: false,
  postPurchaseEnabled: false,
};
