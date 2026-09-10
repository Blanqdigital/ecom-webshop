"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { PRODUCTS, type Product, type ProductColor } from "@/lib/products";
import { inventoryKey, type InventorySnapshot } from "@/lib/inventory-types";
import { type AdminOrder, topVariants, fmtMoney } from "@/lib/admin-stats";
import { Card } from "../ui";

export function Products({ orders, token }: { orders: AdminOrder[]; token: string }) {
  const sold = useMemo(() => topVariants(orders), [orders]);
  const [inventory, setInventory] = useState<InventorySnapshot>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/admin/inventory", {
      headers: { authorization: `Bearer ${token}` },
      cache: "no-store",
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Couldn't load inventory.");
        if (alive) setInventory(data.inventory ?? {});
      })
      .catch((loadError) => {
        if (alive) setError((loadError as Error).message);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [token]);

  const known = Object.values(inventory).filter((row) => row.available != null);
  const totalAvailable = known.reduce((sum, row) => sum + (row.available ?? 0), 0);
  const variants = PRODUCTS.reduce((sum, product) => sum + product.colors.length, 0);
  const uncounted = Math.max(0, variants - known.length);
  const unitsFor = (slug: string, colorId: string) =>
    sold.find((variant) => variant.key === inventoryKey(slug, colorId))?.units ?? 0;

  async function save(key: string, onHand: number, restockDays: number) {
    const res = await fetch("/api/admin/inventory", {
      method: "PUT",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ key, onHand, restockDays }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Couldn't save stock.");
    setInventory(data.inventory ?? {});
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-[18px] font-semibold text-ink">Product management</h2>
        <p className="mt-1 max-w-3xl text-[13px] leading-relaxed text-[#777771]">
          Catalogue and stock now live together here. Enter the quantity you physically
          have today; paid orders after that count are deducted automatically. A zero-stock
          variant stays purchasable and receives a clear extra-delivery warning in the shop.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Summary label="Products" value={String(PRODUCTS.length)} />
        <Summary label="Available units" value={known.length ? String(totalAvailable) : "—"} />
        <Summary label="Needs a stock count" value={String(uncounted)} warning={uncounted > 0} />
      </div>

      {error ? (
        <div className="rounded-xl border border-[#f0d9d7] bg-[#fdf6f5] px-5 py-4 text-[14px] text-[#9a2820]">
          {error}
        </div>
      ) : loading && Object.keys(inventory).length === 0 ? (
        <div className="text-[14px] text-[#8a8a84]">Loading products …</div>
      ) : (
        PRODUCTS.map((product) => (
          <ProductInventoryCard
            key={product.slug}
            product={product}
            inventory={inventory}
            unitsFor={unitsFor}
            onSave={save}
          />
        ))
      )}
    </div>
  );
}

function Summary({ label, value, warning = false }: { label: string; value: string; warning?: boolean }) {
  return (
    <Card className="p-4">
      <div className="text-[12px] font-medium uppercase tracking-[0.08em] text-[#8a8a84]">{label}</div>
      <div className={`mt-1 text-[24px] font-semibold ${warning ? "text-[#9a5a20]" : "text-ink"}`}>
        {value}
      </div>
    </Card>
  );
}

function ProductInventoryCard({
  product,
  inventory,
  unitsFor,
  onSave,
}: {
  product: Product;
  inventory: InventorySnapshot;
  unitsFor: (slug: string, colorId: string) => number;
  onSave: (key: string, onHand: number, restockDays: number) => Promise<void>;
}) {
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#eeeeea] p-5">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-clay">Active product</div>
          <h3 className="mt-1 font-serif text-[24px] text-ink">{product.name}</h3>
          <p className="mt-1 max-w-[60ch] text-[13px] text-[#6b6b66]">{product.blurb}</p>
        </div>
        <div className="text-right">
          <div className="text-[21px] font-semibold text-ink">{fmtMoney(product.priceNok)}</div>
          {product.compareAtNok ? (
            <div className="text-[12.5px] text-[#a3a39c] line-through">{fmtMoney(product.compareAtNok)}</div>
          ) : null}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] text-left text-[13px]">
          <thead className="bg-[#fafaf7] text-[11px] font-semibold uppercase tracking-[0.06em] text-[#8a8a84]">
            <tr>
              <th className="px-5 py-3">Variant</th>
              <th className="px-3 py-3 text-right">Sold total</th>
              <th className="px-3 py-3 text-right">Available now</th>
              <th className="px-3 py-3">Physical count today</th>
              <th className="px-3 py-3">Extra days if empty</th>
              <th className="px-5 py-3 text-right">Status</th>
            </tr>
          </thead>
          <tbody>
            {product.colors.map((color) => {
              const key = inventoryKey(product.slug, color.id);
              const stock = inventory[key];
              return (
                <InventoryRow
                  key={`${key}-${stock?.countedAt ?? "uncounted"}`}
                  product={product}
                  color={color}
                  stock={stock}
                  soldTotal={unitsFor(product.slug, color.id)}
                  onSave={onSave}
                />
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function InventoryRow({
  product,
  color,
  stock,
  soldTotal,
  onSave,
}: {
  product: Product;
  color: ProductColor;
  stock: InventorySnapshot[string] | undefined;
  soldTotal: number;
  onSave: (key: string, onHand: number, restockDays: number) => Promise<void>;
}) {
  const [count, setCount] = useState(stock?.available?.toString() ?? "");
  const [days, setDays] = useState(String(stock?.restockDays ?? 10));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const key = inventoryKey(product.slug, color.id);
  const available = stock?.available;
  const status = available == null ? "Not counted" : available > 0 ? "In stock" : "Orderable · delayed";
  const statusClass = available == null
    ? "bg-[#eef0ee] text-[#6b6b66]"
    : available > 0
      ? "bg-[#d9f2e3] text-[#1f7a4d]"
      : "bg-[#fff0d5] text-[#8a551d]";

  async function submit() {
    const onHand = Number(count);
    const restockDays = Number(days);
    if (!Number.isInteger(onHand) || onHand < 0) {
      setMessage("Enter 0 or a whole number.");
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      await onSave(key, onHand, restockDays);
      setMessage("Saved");
    } catch (saveError) {
      setMessage((saveError as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <tr className="border-t border-[#eeeeea] align-middle">
      <td className="px-5 py-3">
        <div className="flex items-center gap-3">
          <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-md border border-[#eeeeea] bg-white">
            <Image src={color.image} alt={color.name} fill className="object-contain p-1" sizes="44px" />
          </div>
          <div>
            <div className="font-semibold text-ink">{color.name}</div>
            <div className="text-[11.5px] text-[#8a8a84]">{color.id}</div>
          </div>
        </div>
      </td>
      <td className="px-3 py-3 text-right text-[#6b6b66]">{soldTotal}</td>
      <td className="px-3 py-3 text-right text-[15px] font-semibold text-ink">{available ?? "—"}</td>
      <td className="px-3 py-3">
        <input
          type="number"
          min="0"
          step="1"
          value={count}
          placeholder="Enter count"
          onChange={(event) => { setCount(event.target.value); setMessage(null); }}
          className="h-9 w-28 rounded-lg border border-[#ddddda] px-3 text-[13px] outline-none focus:border-ink"
        />
      </td>
      <td className="px-3 py-3">
        <div className="flex items-center gap-2">
          <input
            type="number"
            min="1"
            max="90"
            step="1"
            value={days}
            onChange={(event) => { setDays(event.target.value); setMessage(null); }}
            className="h-9 w-20 rounded-lg border border-[#ddddda] px-3 text-[13px] outline-none focus:border-ink"
          />
          <button
            type="button"
            onClick={submit}
            disabled={saving}
            className="h-9 rounded-lg bg-ink px-3.5 text-[12.5px] font-semibold text-cream disabled:opacity-50"
          >
            {saving ? "Saving …" : "Save"}
          </button>
        </div>
        {message ? (
          <div className={`mt-1 text-[11px] ${message === "Saved" ? "text-[#1f7a4d]" : "text-[#9a2820]"}`}>
            {message}
          </div>
        ) : stock?.countedAt ? (
          <div className="mt-1 text-[11px] text-[#8a8a84]">Counted {new Date(stock.countedAt).toLocaleDateString("nb-NO")}</div>
        ) : null}
      </td>
      <td className="px-5 py-3 text-right">
        <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusClass}`}>{status}</span>
      </td>
    </tr>
  );
}
