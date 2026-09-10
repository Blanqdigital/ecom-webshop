"use client";

export interface EmailRow {
  id: string;
  type: string;
  recipient: string;
  subject: string | null;
  status: string;
  error: string | null;
  created_at: string;
}

export interface FlowStats {
  captured: number;
  unsubscribed: number;
  sent1: number;
  sent2: number;
  waitingFor1: number;
  waitingFor2: number;
  doneNoPurchase: number;
  converted: number;
  convertedBeforeEmail: number;
  convertedAfter1: number;
  convertedAfter2: number;
}

export const TYPE_META: Record<string, { label: string; bg: string; fg: string }> = {
  cart_reminder: { label: "Cart reminder", bg: "#f6e3d9", fg: "#8a4a2e" },
  cart_reminder_2: { label: "Final reminder", bg: "#f0d9d7", fg: "#8a2e2e" },
  welcome_1: { label: "Welcome email", bg: "#eee5f6", fg: "#68428a" },
  order_confirmation: { label: "Order confirmation", bg: "#d9f2e3", fg: "#1f7a4d" },
  order_shipped: { label: "Shipping notice", bg: "#d9e8f2", fg: "#1f5a7a" },
  order_admin: { label: "Admin alert", bg: "#eef0ee", fg: "#4a4a45" },
};

export function TypeBadge({ type }: { type: string }) {
  const m = TYPE_META[type] ?? { label: type, bg: "#eef0ee", fg: "#4a4a45" };
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-[3px] text-[12px] font-semibold"
      style={{ background: m.bg, color: m.fg }}
    >
      {m.label}
    </span>
  );
}

export function FlowNode({
  title,
  subtitle,
  count,
  countLabel,
  tone,
  onPreview,
  previewOpen,
}: {
  title: string;
  subtitle: string;
  count: number;
  countLabel?: string;
  tone: string;
  onPreview?: () => void;
  previewOpen?: boolean;
}) {
  return (
    <div
      className="flex items-center gap-4 rounded-xl px-4 py-3.5 text-cream"
      style={{ background: tone }}
    >
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13.5px] font-semibold">{title}</div>
        <div className="truncate text-[11.5px] text-cream/70">{subtitle}</div>
      </div>
      {onPreview && (
        <button
          onClick={onPreview}
          className="shrink-0 rounded-md border border-cream/30 px-2.5 py-1 text-[11.5px] font-medium text-cream/90 transition-colors hover:bg-cream/10"
        >
          {previewOpen ? "Hide" : "Preview"}
        </button>
      )}
      <div className="shrink-0 text-right">
        <div className="text-[18px] font-semibold leading-none">{count}</div>
        {countLabel && (
          <div className="text-[10.5px] uppercase tracking-wide text-cream/60">
            {countLabel}
          </div>
        )}
      </div>
    </div>
  );
}

export function FlowArrow({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 py-1.5 pl-6 text-[11.5px] text-[#a3a39c]">
      <span>↓</span>
      <span>{label}</span>
    </div>
  );
}

export function SideStat({
  label,
  value,
  tone,
  detail,
}: {
  label: string;
  value: number;
  tone: string;
  detail: string[];
}) {
  return (
    <div className="rounded-xl border border-[#eeeeea] p-4">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[13px] font-medium text-ink">{label}</span>
        <span className="text-[18px] font-semibold" style={{ color: tone }}>
          {value}
        </span>
      </div>
      <ul className="mt-1.5 space-y-0.5 text-[11.5px] text-[#8a8a84]">
        {detail.map((d) => (
          <li key={d}>{d}</li>
        ))}
      </ul>
    </div>
  );
}
