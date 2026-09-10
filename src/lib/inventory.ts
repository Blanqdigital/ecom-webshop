import "server-only";

import { getSupabaseAdmin } from "./supabase";
import { PRODUCTS } from "./products";
import {
  applySalesToInventory,
  inventoryKey,
  type InventorySnapshot,
  type VariantInventory,
} from "./inventory-types";

const SETTINGS_KEY = "product_inventory_v1";
export const DEFAULT_RESTOCK_DAYS = 10;

interface StoredInventory {
  onHand: number | null;
  countedAt: string | null;
  restockDays: number;
}

type StoredInventoryMap = Record<string, StoredInventory>;

function validRestockDays(value: unknown): number {
  const days = Number(value);
  return Number.isInteger(days) && days >= 1 && days <= 90
    ? days
    : DEFAULT_RESTOCK_DAYS;
}

function sanitizeStored(value: unknown): StoredInventoryMap {
  if (!value || typeof value !== "object") return {};
  const result: StoredInventoryMap = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Record<string, unknown>;
    const onHand = row.onHand == null ? null : Number(row.onHand);
    result[key] = {
      onHand:
        onHand == null || !Number.isInteger(onHand) || onHand < 0
          ? null
          : onHand,
      countedAt:
        typeof row.countedAt === "string" && !Number.isNaN(Date.parse(row.countedAt))
          ? row.countedAt
          : null,
      restockDays: validRestockDays(row.restockDays),
    };
  }
  return result;
}

async function getStoredInventory(): Promise<StoredInventoryMap> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return {};
  const { data, error } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", SETTINGS_KEY)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return sanitizeStored(data?.value);
}

export async function getInventorySnapshot(): Promise<InventorySnapshot> {
  const supabase = getSupabaseAdmin();
  const stored = await getStoredInventory();
  const result: InventorySnapshot = {};
  let earliestCount: string | null = null;

  for (const product of PRODUCTS) {
    for (const color of product.colors) {
      const key = inventoryKey(product.slug, color.id);
      const saved = stored[key];
      const row: VariantInventory = {
        onHand: saved?.onHand ?? null,
        countedAt: saved?.countedAt ?? null,
        soldSinceCount: 0,
        available: saved?.onHand ?? null,
        restockDays: saved?.restockDays ?? DEFAULT_RESTOCK_DAYS,
      };
      result[key] = row;
      if (row.countedAt && (!earliestCount || row.countedAt < earliestCount)) {
        earliestCount = row.countedAt;
      }
    }
  }

  if (!supabase || !earliestCount) return result;

  const { data: orders, error } = await supabase
    .from("orders")
    .select("items,created_at")
    .eq("payment_status", "paid")
    .gte("created_at", earliestCount)
    .order("created_at", { ascending: true })
    .limit(10000);
  if (error) throw new Error(error.message);

  return applySalesToInventory(
    result,
    (orders ?? []).map((order) => ({
      created_at: String(order.created_at ?? ""),
      items: order.items,
    })),
  );
}

export async function saveInventoryCount(input: {
  key: string;
  onHand: number;
  restockDays: number;
}): Promise<InventorySnapshot> {
  const validKeys = new Set(
    PRODUCTS.flatMap((product) =>
      product.colors.map((color) => inventoryKey(product.slug, color.id)),
    ),
  );
  if (!validKeys.has(input.key)) throw new Error("Unknown product variant.");
  if (!Number.isInteger(input.onHand) || input.onHand < 0 || input.onHand > 100000) {
    throw new Error("Stock must be a whole number from 0 to 100,000.");
  }
  if (
    !Number.isInteger(input.restockDays) ||
    input.restockDays < 1 ||
    input.restockDays > 90
  ) {
    throw new Error("Extra delivery time must be between 1 and 90 days.");
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Database isn't configured.");
  const stored = await getStoredInventory();
  stored[input.key] = {
    onHand: input.onHand,
    countedAt: new Date().toISOString(),
    restockDays: input.restockDays,
  };
  const { error } = await supabase.from("app_settings").upsert({
    key: SETTINGS_KEY,
    value: stored,
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);
  return getInventorySnapshot();
}
