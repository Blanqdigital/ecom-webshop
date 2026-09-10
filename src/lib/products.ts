export interface ProductColor {
  id: string;
  name: string;
  hex: string;    // swatch dot colour
  image: string;  // /public path to product photo
}

export interface Product {
  slug: string;
  name: string;
  tagline: string;
  blurb: string;
  priceNok: number;
  compareAtNok?: number;
  ratingValue: string;
  ratingCount: string;
  colors: ProductColor[];
  /** Shared lifestyle/explainer shots shown as gallery thumbnails under the
   *  main product image (independent of the selected variant). */
  gallery?: { src: string; alt: string }[];
}

export const SAMPLE_PRODUCT: Product = {
  slug: "sample-product", name: "Eksempelprodukt", tagline: "Bytt ut med ditt produkts viktigste fordel.",
  blurb: "Et nøytralt eksempel for å teste varianter, handlekurv og butikkoppsett.",
  priceNok: 100, ratingValue: "", ratingCount: "",
  colors: [{ id: "standard", name: "Standard", hex: "#334155", image: "/images/sample-product.svg" }],
};
export const PRODUCTS: Product[] = [SAMPLE_PRODUCT];
export function getProduct(slug: string): Product | undefined { return PRODUCTS.find(p => p.slug === slug); }
