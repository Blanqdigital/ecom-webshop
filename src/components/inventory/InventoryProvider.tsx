"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { InventorySnapshot } from "@/lib/inventory-types";

interface InventoryContextValue {
  inventory: InventorySnapshot;
  loading: boolean;
}

const InventoryContext = createContext<InventoryContextValue | null>(null);

/** One shared inventory request for the whole storefront session. */
export function InventoryProvider({ children }: { children: React.ReactNode }) {
  const [inventory, setInventory] = useState<InventorySnapshot>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    fetch("/api/inventory", { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => {
        if (alive && data?.inventory) setInventory(data.inventory);
      })
      .catch(() => {})
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const value = useMemo(() => ({ inventory, loading }), [inventory, loading]);
  return (
    <InventoryContext.Provider value={value}>
      {children}
    </InventoryContext.Provider>
  );
}

export function useInventory(): InventoryContextValue {
  const value = useContext(InventoryContext);
  if (!value) throw new Error("useInventory must be used within InventoryProvider");
  return value;
}
