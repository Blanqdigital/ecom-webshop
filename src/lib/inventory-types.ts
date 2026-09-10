export interface VariantInventory {
  onHand: number | null;
  countedAt: string | null;
  soldSinceCount: number;
  available: number | null;
  restockDays: number;
}

export type InventorySnapshot = Record<string, VariantInventory>;

export interface InventoryLine {
  slug: string;
  colorId: string;
  qty?: number;
}

export interface InventoryOrder {
  created_at: string;
  items: unknown;
}

export const inventoryKey = (slug: string, colorId: string) =>
  `${slug}::${colorId}`;

export interface DelayedInventoryLine {
  key: string;
  slug: string;
  colorId: string;
  requested: number;
  available: number;
  restockDays: number;
}

/** Lines whose requested quantity exceeds the currently available quantity. */
export function delayedInventoryLines(
  lines: InventoryLine[],
  inventory: InventorySnapshot,
): DelayedInventoryLine[] {
  const requested = new Map<string, { slug: string; colorId: string; qty: number }>();
  for (const line of lines) {
    const key = inventoryKey(line.slug, line.colorId);
    const row = requested.get(key) ?? {
      slug: line.slug,
      colorId: line.colorId,
      qty: 0,
    };
    row.qty += Math.max(0, Number(line.qty) || 0);
    requested.set(key, row);
  }

  const delayed: DelayedInventoryLine[] = [];
  for (const [key, line] of requested) {
    const stock = inventory[key];
    // Unknown/un-counted stock is surfaced in admin, but does not create a
    // customer warning until a real physical count has been saved.
    if (stock?.available == null || line.qty <= stock.available) continue;
    delayed.push({
      key,
      slug: line.slug,
      colorId: line.colorId,
      requested: line.qty,
      available: stock.available,
      restockDays: stock.restockDays,
    });
  }
  return delayed;
}

/** Deduct paid order units that were placed after each variant's physical count. */
export function applySalesToInventory(
  inventory: InventorySnapshot,
  orders: InventoryOrder[],
): InventorySnapshot {
  const result = Object.fromEntries(
    Object.entries(inventory).map(([key, row]) => [
      key,
      { ...row, soldSinceCount: 0, available: row.onHand },
    ]),
  ) as InventorySnapshot;

  for (const order of orders) {
    const items = Array.isArray(order.items) ? order.items : [];
    for (const raw of items) {
      if (!raw || typeof raw !== "object") continue;
      const item = raw as Record<string, unknown>;
      const key = inventoryKey(String(item.slug ?? ""), String(item.colorId ?? ""));
      const stock = result[key];
      if (!stock?.countedAt || order.created_at < stock.countedAt) continue;
      stock.soldSinceCount += Math.max(0, Number(item.qty) || 0);
    }
  }

  for (const stock of Object.values(result)) {
    if (stock.onHand != null) {
      stock.available = Math.max(0, stock.onHand - stock.soldSinceCount);
    }
  }
  return result;
}
