"use client";

import { getProduct } from "@/lib/products";
import {
  delayedInventoryLines,
  inventoryKey,
  type InventoryLine,
  type VariantInventory,
} from "@/lib/inventory-types";
import { useInventory } from "./InventoryProvider";

const COPY = {
  inStock: "På lager",
  delayed: (days: number) => `Bestillingsvare · opptil ${days} ekstra dager`,
  warning: (items: string, days: number) =>
    `${items} er ikke på lager i ønsket antall. Du kan fortsatt bestille nå, men ordren kan ta opptil ${days} ekstra dager.`,
};

export function stockStatusLabel(stock: VariantInventory | undefined) {
  if (stock?.available == null) return null;
  return stock.available > 0
    ? COPY.inStock
    : COPY.delayed(stock.restockDays);
}

export function VariantStockStatus({
  slug,
  colorId,
  className = "",
}: {
  slug: string;
  colorId: string;
  className?: string;
}) {
  const { inventory } = useInventory();
  const stock = inventory[inventoryKey(slug, colorId)];
  const label = stockStatusLabel(stock);
  if (!label) return null;
  const delayed = stock.available === 0;
  return (
    <span className={`${delayed ? "text-[#9a5a20]" : "text-[#1f7a4d]"} ${className}`}>
      {label}
    </span>
  );
}

/** Aggregate warning used before purchase on product, cart and checkout. */
export function StockDelayNotice({
  lines,
  className = "",
  compact = false,
}: {
  lines: InventoryLine[];
  className?: string;
  compact?: boolean;
}) {
  const { inventory } = useInventory();
  const delayed = delayedInventoryLines(lines, inventory);
  if (delayed.length === 0) return null;

  const names = delayed.map((line) => {
    const product = getProduct(line.slug);
    if (!product) return line.colorId;
    const color = product.colors.find((entry) => entry.id === line.colorId);
    return `${product.name} – ${color?.name ?? line.colorId}`;
  });
  const maxDays = Math.max(...delayed.map((line) => line.restockDays));

  return (
    <div
      role="status"
      className={`rounded-xl border border-[#e8c998] bg-[#fff8e8] text-[#714619] ${
        compact ? "px-3 py-2 text-[12px]" : "px-4 py-3 text-[13px] leading-relaxed"
      } ${className}`}
    >
      <span className="font-semibold">{COPY.warning(names.join(", "), maxDays)}</span>
    </div>
  );
}
