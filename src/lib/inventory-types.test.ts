import test from "node:test";
import assert from "node:assert/strict";
import { applySalesToInventory, delayedInventoryLines } from "./inventory-types";

test("unknown inventory stays unknown; counts only subtract subsequent sales", () => {
  const countedAt = "2026-09-10T12:00:00Z";
  const snapshot = {
    "p::a": { onHand: 5, countedAt, soldSinceCount: 0, available: 5, restockDays: 10 },
    "p::b": { onHand: null, countedAt: null, soldSinceCount: 0, available: null, restockDays: 10 },
  };
  const result = applySalesToInventory(snapshot, [
    { created_at: "2026-09-09T12:00:00Z", items: [{ slug: "p", colorId: "a", qty: 4 }] },
    { created_at: "2026-09-10T13:00:00Z", items: [{ slug: "p", colorId: "a", qty: 2 }] },
  ]);
  assert.equal(result["p::a"].available, 3);
  assert.equal(result["p::b"].available, null);
  assert.equal(snapshot["p::a"].available, 5);
  assert.equal(delayedInventoryLines([{ slug: "p", colorId: "b", qty: 10 }], result).length, 0);
  assert.equal(delayedInventoryLines([{ slug: "p", colorId: "a", qty: 4 }], result).length, 1);
});
