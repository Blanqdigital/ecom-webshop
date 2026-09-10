"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { track } from "@/lib/track";
import { logFunnel } from "@/lib/analytics";
import { InventoryProvider } from "@/components/inventory/InventoryProvider";

export interface CartItem {
  slug: string;
  colorId: string;
  colorName: string;
  colorImage: string;
  name: string;
  priceNok: number;
  qty: number;
  free?: boolean;
}

interface CartCtx {
  items: CartItem[];
  count: number;
  subtotal: number;
  hydrated: boolean;
  isOpen: boolean;
  open: () => void;
  close: () => void;
  add: (item: Omit<CartItem, "qty">, qty?: number) => void;
  setQty: (slug: string, colorId: string, qty: number, free?: boolean) => void;
  remove: (slug: string, colorId: string, free?: boolean) => void;
}

const Ctx = createContext<CartCtx | null>(null);
const KEY = "bara_cart_v1";
const lineKey = (i: { slug: string; colorId: string; free?: boolean }) =>
  `${i.slug}::${i.colorId}::${i.free ? "free" : "paid"}`;

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  // Load once on mount.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setItems(JSON.parse(raw));
    } catch {
      /* ignore */
    }
    setHydrated(true);
  }, []);

  // Persist after hydration so we don't clobber storage with the empty initial.
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(KEY, JSON.stringify(items));
    } catch {
      /* ignore */
    }
  }, [items, hydrated]);

  const value = useMemo<CartCtx>(() => {
    const count = items.reduce((a, i) => a + i.qty, 0);
    const subtotal = items.reduce((a, i) => a + i.qty * i.priceNok, 0);
    return {
      items,
      count,
      subtotal,
      hydrated,
      isOpen,
      open: () => setIsOpen(true),
      close: () => setIsOpen(false),
      add: (item, qty = 1) => {
        setItems((prev) => {
          const k = lineKey(item);
          const found = prev.find((i) => lineKey(i) === k);
          if (found) {
            return prev.map((i) =>
              lineKey(i) === k ? { ...i, qty: i.qty + qty } : i,
            );
          }
          return [...prev, { ...item, qty }];
        });
        setIsOpen(true);
        // Meta Pixel: count one AddToCart per user action. Skip the free BOGO
        // unit (priceNok 0) so a buy-one-get-one click fires a single event.
        if (!item.free) {
          track("AddToCart", {
            content_ids: [item.slug],
            content_name: item.name,
            content_type: "product",
            value: item.priceNok * qty,
            currency: "NOK",
          });
          // First-party funnel (all visitors, independent of cookie consent).
          logFunnel("AddToCart", { value: item.priceNok * qty, currency: "NOK" });
        }
      },
      setQty: (slug, colorId, qty, free) =>
        setItems((prev) =>
          prev
            .map((i) =>
              i.slug === slug && i.colorId === colorId && !!i.free === !!free
                ? { ...i, qty: Math.max(0, qty) }
                : i,
            )
            .filter((i) => i.qty > 0),
        ),
      remove: (slug, colorId, free) =>
        setItems((prev) =>
          prev.filter(
            (i) =>
              !(
                i.slug === slug &&
                i.colorId === colorId &&
                !!i.free === !!free
              ),
          ),
        ),
    };
  }, [items, isOpen, hydrated]);

  return (
    <InventoryProvider>
      <Ctx.Provider value={value}>{children}</Ctx.Provider>
    </InventoryProvider>
  );
}

export function useCart(): CartCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useCart must be used within CartProvider");
  return c;
}
