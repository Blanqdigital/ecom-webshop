"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import type { AdminOrder } from "@/lib/admin-stats";
import { DateRangePicker, defaultRange, type Range } from "./DateRange";
import type { FunnelCounts } from "./Funnel";
import { Dashboard } from "./views/Dashboard";
import { Orders } from "./views/Orders";
import { Products } from "./views/Products";
import { Customers } from "./views/Customers";
import { Marketing } from "./views/Marketing";
import { Insights } from "./views/Insights";
import { Todos } from "./views/Todos";
import { Settings } from "./views/Settings";
import { Integrations } from "./views/Integrations";
import { COMPANY } from "@/lib/company";
import {
  IconGrid,
  IconBox,
  IconTag,
  IconChart,
  IconUsers,
  IconMail,
  IconCheck,
  IconGear,
  IconPlug,
} from "./AdminIcons";

type View =
  | "dashboard"
  | "orders"
  | "products"
  | "customers"
  | "marketing"
  | "insights"
  | "todo"
  | "settings"
  | "integrations";

const NAV: { key: View; label: string; icon: React.ReactNode }[] = [
  { key: "dashboard", label: "Dashboard", icon: <IconGrid /> },
  { key: "orders", label: "Orders", icon: <IconBox /> },
  { key: "products", label: "Products", icon: <IconTag /> },
  { key: "customers", label: "Customers", icon: <IconUsers /> },
  { key: "marketing", label: "Marketing", icon: <IconMail /> },
  { key: "insights", label: "Insights", icon: <IconChart /> },
  { key: "todo", label: "To-do", icon: <IconCheck /> },
  { key: "settings", label: "Settings", icon: <IconGear /> },
  { key: "integrations", label: "Integrations", icon: <IconPlug /> },
];

const TITLES: Record<View, string> = {
  dashboard: "Dashboard",
  orders: "Orders",
  products: "Products",
  customers: "Customer base",
  marketing: "Marketing — sent emails",
  insights: "Insights",
  todo: "Store to-do list",
  settings: "Settings",
  integrations: "Integrations",
};

/** Tabs that manage their own data (no global date range / refresh). */
const SELF_CONTAINED: View[] = [
  "customers",
  "marketing",
  "todo",
  "settings",
  "integrations",
];

export function AdminShell({
  session,
  onSignOut,
}: {
  session: Session;
  onSignOut: () => void;
}) {
  const [view, setView] = useState<View>("dashboard");
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [range, setRange] = useState<Range>(defaultRange());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [funnel, setFunnel] = useState<{
    ready: boolean;
    counts: FunnelCounts;
  } | null>(null);
  const [funnelLoading, setFunnelLoading] = useState(true);
  const email = session.user.email ?? "";

  const from = useMemo(() => new Date(`${range.from}T00:00:00`), [range.from]);
  const to = useMemo(() => new Date(`${range.to}T23:59:59.999`), [range.to]);
  const filtered = useMemo(() => {
    const lo = from.getTime();
    const hi = to.getTime();
    return orders.filter((o) => {
      const t = new Date(o.created_at).getTime();
      return t >= lo && t <= hi;
    });
  }, [orders, from, to]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/orders", {
        headers: { authorization: `Bearer ${session.access_token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't load orders.");
      setOrders(data.orders);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [session.access_token]);

  useEffect(() => {
    load();
  }, [load]);

  // Funnel counts are aggregated server-side per date range, so they refetch
  // whenever the range changes (unlike orders, which are filtered client-side).
  const loadFunnel = useCallback(async () => {
    setFunnelLoading(true);
    try {
      const params = new URLSearchParams({
        from: from.toISOString(),
        to: to.toISOString(),
      });
      const res = await fetch(`/api/admin/funnel?${params}`, {
        headers: { authorization: `Bearer ${session.access_token}` },
      });
      const data = await res.json();
      if (res.ok) setFunnel({ ready: data.ready, counts: data.counts });
    } catch {
      /* leave the previous funnel data in place on a transient failure */
    } finally {
      setFunnelLoading(false);
    }
  }, [from, to, session.access_token]);

  useEffect(() => {
    loadFunnel();
  }, [loadFunnel]);

  const onUpdated = (o: AdminOrder) =>
    setOrders((prev) => prev.map((p) => (p.id === o.id ? o : p)));

  const onDeleted = (id: string) =>
    setOrders((prev) => prev.filter((p) => p.id !== id));

  const toFulfill = orders.filter(
    (o) =>
      o.payment_status?.toLowerCase() === "paid" &&
      (o.fulfillment_status ?? "new") === "new",
  ).length;

  return (
    <div className="flex min-h-screen bg-[#f6f6f3] text-ink">
      {/* Sidebar (desktop) */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-[#e8e8e4] bg-white lg:flex">
        <div className="flex items-center gap-2 px-6 py-5">
          <span className="font-serif text-[22px] tracking-[0.04em]">
            {COMPANY.brand}
          </span>
          <span className="rounded bg-ink px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-cream">
            Admin
          </span>
        </div>
        <nav className="flex-1 px-3 py-2">
          {NAV.map((n) => (
            <NavButton
              key={n.key}
              item={n}
              active={view === n.key}
              badge={n.key === "orders" ? toFulfill : 0}
              onClick={() => setView(n.key)}
            />
          ))}
        </nav>
        <div className="border-t border-[#f0f0ec] px-5 py-4">
          <div className="truncate text-[12px] text-[#8a8a84]">{email}</div>
          <button
            onClick={onSignOut}
            className="mt-1 text-[12.5px] font-medium text-clay hover:underline"
          >
            Sign out
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar + nav */}
        <div className="border-b border-[#e8e8e4] bg-white lg:hidden">
          <div className="flex items-center justify-between px-5 py-4">
            <span className="font-serif text-[20px]">{COMPANY.brand} Admin</span>
            <button onClick={onSignOut} className="text-[13px] font-medium text-clay">
              Sign out
            </button>
          </div>
          <div className="flex gap-1 overflow-x-auto px-3 pb-2">
            {NAV.map((n) => (
              <button
                key={n.key}
                onClick={() => setView(n.key)}
                className={`shrink-0 rounded-md px-3 py-1.5 text-[13px] font-medium ${
                  view === n.key ? "bg-ink text-cream" : "text-[#6b6b66]"
                }`}
              >
                {n.label}
              </button>
            ))}
          </div>
        </div>

        {/* Top bar */}
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e8e8e4] bg-white px-5 py-4 lg:px-8">
          <h1 className="text-[19px] font-semibold">{TITLES[view]}</h1>
          <div className="flex flex-wrap items-center gap-3">
            {!SELF_CONTAINED.includes(view) && (
              <>
                <DateRangePicker value={range} onChange={setRange} />
                <button
                  onClick={() => {
                    load();
                    loadFunnel();
                  }}
                  disabled={loading}
                  className="rounded-lg border border-[#e2e2dd] px-3.5 py-1.5 text-[13px] font-medium text-ink transition-colors hover:border-ink disabled:opacity-50"
                >
                  {loading ? "Refreshing …" : "Refresh"}
                </button>
              </>
            )}
          </div>
        </header>

        <main className="flex-1 px-5 py-6 lg:px-8">
          {error ? (
            <div className="rounded-xl border border-[#f0d9d7] bg-[#fdf6f5] px-5 py-4 text-[14px] text-[#9a2820]">
              {error}
            </div>
          ) : loading && orders.length === 0 ? (
            <div className="text-[14px] text-[#8a8a84]">Loading …</div>
          ) : view === "dashboard" ? (
            <Dashboard
              orders={filtered}
              from={from}
              to={to}
              funnel={funnel}
              funnelLoading={funnelLoading}
              onOpenOrders={() => setView("orders")}
            />
          ) : view === "orders" ? (
            <Orders
              orders={filtered}
              token={session.access_token}
              onUpdated={onUpdated}
              onDeleted={onDeleted}
            />
          ) : view === "products" ? (
            <Products orders={filtered} token={session.access_token} />
          ) : view === "customers" ? (
            <Customers token={session.access_token} />
          ) : view === "marketing" ? (
            <Marketing token={session.access_token} />
          ) : view === "insights" ? (
            <Insights
              orders={filtered}
              from={from}
              to={to}
              funnel={funnel}
              funnelLoading={funnelLoading}
              token={session.access_token}
            />
          ) : view === "todo" ? (
            <Todos token={session.access_token} />
          ) : view === "integrations" ? (
            <Integrations token={session.access_token} />
          ) : (
            <Settings
              email={email}
              token={session.access_token}
              onSignOut={onSignOut}
            />
          )}
        </main>
      </div>
    </div>
  );
}

function NavButton({
  item,
  active,
  badge,
  onClick,
}: {
  item: { label: string; icon: React.ReactNode };
  active: boolean;
  badge: number;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`mb-0.5 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-[14px] font-medium transition-colors ${
        active ? "bg-ink text-cream" : "text-[#5a5a55] hover:bg-[#f3f3ef]"
      }`}
    >
      <span className={active ? "text-cream" : "text-[#9a9a93]">{item.icon}</span>
      <span className="flex-1 text-left">{item.label}</span>
      {badge > 0 && (
        <span
          className={`rounded-full px-1.5 py-0.5 text-[11px] font-semibold ${
            active ? "bg-cream/20 text-cream" : "bg-clay text-cream"
          }`}
        >
          {badge}
        </span>
      )}
    </button>
  );
}
