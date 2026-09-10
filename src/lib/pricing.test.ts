import test from "node:test";
import assert from "node:assert/strict";
import { priceCart } from "./pricing";
import { PRODUCTS } from "./products";
import { COMMERCE } from "./commerce";

const product = PRODUCTS[0];
const line = { slug: product.slug, colorId: product.colors[0].id, qty: 2 };
test("client free flags cannot activate a promotion", () => {
  assert.equal(priceCart([{ ...line, free: true }]).amountOre, product.priceNok * 200);
  assert.equal(priceCart([line], { colorId: line.colorId }).cartMeta.length, 1);
});
test("invalid quantities are rejected and billed units match fulfilment metadata", () => {
  for (const qty of [-1, 0, 1.5, 100, Infinity, NaN]) assert.throws(() => priceCart([{ ...line, qty }]));
  assert.throws(() => priceCart([null as never]));
  assert.throws(() => priceCart([{ ...line, colorId: "unknown" }]));
  assert.equal(priceCart([line]).cartMeta[0].qty, 2);
});
test("explicit BOGO grants only backed units of the eligible product", () => {
  COMMERCE.bogoSlugs = [product.slug];
  try {
    assert.equal(priceCart([{ ...line, qty: 1 }, { ...line, free: true }]).amountOre, product.priceNok * 200);
    assert.equal(priceCart([{ ...line, free: true }]).amountOre, product.priceNok * 200);
  } finally { COMMERCE.bogoSlugs = []; }
});
