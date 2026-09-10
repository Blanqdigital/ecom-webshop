export const SHOPIFY_API_VERSION = "2026-07";
export function validShopifyDomain(value: string): boolean {
  return /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i.test(value);
}
