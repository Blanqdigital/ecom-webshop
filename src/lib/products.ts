// =============================================================================
// SAMPLE CATALOGUE — replace this entire file when spinning up a new store.
// The demo product (slug "baereslyngen") keeps existing routes/images working
// out of the box. Swap slug, copy, prices, colours, and public/images/ before
// launch. See docs/SETUP.md.
// =============================================================================

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

/** Demo single-SKU product shipped with the template (Norwegian example). */
export const SLING: Product = {
  slug: "baereslyngen",
  name: "Bæreslyngen",
  tagline:
    "Hold den lille tett inntil deg, og gi armer, rygg og håndledd hvilen de fortjener. Ett enkelt grep, ingen floker, ingen spenner å lure på.",
  blurb:
    "Bæreslyngen er en ergonomisk bæresele i pustende bomull, mykt som et bæresjal. Fra nyfødt til 25 kg.",
  priceNok: 590,
  compareAtNok: 790,
  ratingValue: "4,9",
  ratingCount: "2 400+",
  colors: [
    { id: "sort",       name: "Sort",        hex: "#111111", image: "/images/sling-sort.webp"       },
    { id: "aztec",      name: "Aztec",       hex: "#B84B36", image: "/images/sling-aztec.webp"      },
    { id: "teddybear",  name: "Teddybjørn",  hex: "#A8896A", image: "/images/sling-teddybear.webp" },
    { id: "bla",        name: "Blå",         hex: "#6A8EAF", image: "/images/sling-bla.webp"        },
    { id: "geometrisk", name: "Geometrisk",  hex: "#2A2A2A", image: "/images/sling-geometrisk.webp" },
    { id: "rutete",     name: "Rutete",      hex: "#3A4D6E", image: "/images/sling-rutete.webp"     },
    { id: "sebra",      name: "Sebra",       hex: "#555555", image: "/images/sling-sebra.webp"      },
  ],
  gallery: [
    {
      src: "/images/explain-detail.jpg",
      alt: "Bæreslyngen sett fra siden: myk polstret skulder, pustende bomull, på i 5 sekunder og vaskbar på 30 grader",
    },
    {
      src: "/images/explain-mposition.jpg",
      alt: "Bæreslyngen støtter den hoftevennlige M-stillingen, med knærne høyere enn rumpa",
    },
    {
      src: "/images/explain-adjustable.jpg",
      alt: "Helt justerbar bæreslynge som passer alle, fra 55 til 88 cm",
    },
    {
      src: "/images/explain-vs.jpg",
      alt: "Demo bæreslyngen mot andre bæreseler: frie hender, får plass i vesken, på i 5 sekunder",
    },
    {
      src: "/images/explain-comparison.jpg",
      alt: "Sammenligning: vanlig bæresele med masete stropper mot demo bæreslyngen som er på i 5 sekunder",
    },
    {
      src: "/images/lifestyle-street.jpg",
      alt: "Mor med frie hender bærer den rolige babyen i Bæreslyngen ute på gaten",
    },
    {
      src: "/images/lifestyle-bla.jpg",
      alt: "Mor holder nyfødt tett inntil seg i Bæreslyngen i fargen Blå",
    },
    {
      src: "/images/explain-lineup.jpg",
      alt: "Bæreslyngen finnes i seks ulike mønstre, samme nærhet",
    },
    {
      src: "/images/explain-review.jpg",
      alt: "Femstjerners omtale: «Endelig en bæresele jeg faktisk bruker. På i fem sekunder – og den er nydelig.»",
    },
  ],
};

export const PRODUCTS: Product[] = [SLING];

export function getProduct(slug: string): Product | undefined {
  return PRODUCTS.find((p) => p.slug === slug);
}
