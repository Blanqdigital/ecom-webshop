// Single source of truth for canonical site identity and target market (used
// by metadata, robots, sitemap and JSON-LD). Keep the URL in sync with the
// connected domain and with COMPANY.url in src/lib/company.ts.
//
// TEMPLATE DEFAULTS — replace url/name (and language/country/currency) when
// spinning up a new store. See docs/SETUP.md and
// docs/methodology/US-MARKET-SEO.md for market switches.
//
// Switching market? Change language/country/currency here and every SEO
// surface (html lang, Open Graph locale, JSON-LD offers/shipping/areaServed)
// follows. US example: language "en-US", country "US", currency "USD".
// Payment and backend currency handling live in their own modules and are NOT
// driven by this file.
export const SITE = {
  url: "https://www.yourshop.example",
  name: "YOUR BRAND",
  /** BCP-47 language tag of the storefront copy (drives html lang + JSON-LD inLanguage). */
  language: "nb-NO",
  /** ISO 3166-1 alpha-2 market country (drives JSON-LD areaServed, shipping and return-policy country). */
  country: "NO",
  /** ISO 4217 currency of displayed prices (drives JSON-LD offer priceCurrency). */
  currency: "NOK",
} as const;

/** Open Graph locale (underscore form), derived from the BCP-47 language tag. */
export function ogLocale(): string {
  return SITE.language.replace("-", "_");
}
