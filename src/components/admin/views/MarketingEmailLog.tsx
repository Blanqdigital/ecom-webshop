"use client";

import { useState } from "react";
import { fmtDateTime } from "@/lib/admin-stats";
import { Card, Empty } from "../ui";
import { type EmailRow, TypeBadge } from "./MarketingHelpers";

export function MarketingEmailLog({
  token,
  emails,
  ready,
  loading,
  onRefresh,
}: {
  token: string;
  emails: EmailRow[];
  ready: boolean;
  loading: boolean;
  onRefresh: () => void;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ id: string; html: string } | null>(null);

  async function toggle(id: string) {
    if (openId === id) {
      setOpenId(null);
      return;
    }
    setOpenId(id);
    if (preview?.id !== id) {
      setPreview(null);
      try {
        const res = await fetch(`/api/admin/emails?id=${encodeURIComponent(id)}`, {
          headers: { authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (res.ok && data.email?.html) setPreview({ id, html: data.email.html });
      } catch {
        /* preview is best-effort */
      }
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={onRefresh}
          disabled={loading}
          className="rounded-lg border border-[#e2e2dd] px-3 py-1.5 text-[13px] font-medium text-ink transition-colors hover:border-ink disabled:opacity-50"
        >
          {loading ? "Refreshing ..." : "Refresh"}
        </button>
        <span className="text-[12.5px] text-[#8a8a84]">
          Every email the store sends - click a row to preview it exactly as the recipient sees it.
        </span>
      </div>

      {loading && emails.length === 0 ? (
        <div className="text-[14px] text-[#8a8a84]">Loading ...</div>
      ) : !ready ? (
        <Empty>
          The email log isn&apos;t set up yet. Run the{" "}
          <code className="rounded bg-[#eee] px-1">email_log</code> SQL from{" "}
          <code className="rounded bg-[#eee] px-1">supabase/schema.sql</code> in
          Supabase, and every email sent from then on shows up here.
        </Empty>
      ) : emails.length === 0 ? (
        <Empty>
          No emails logged yet. The next order confirmation or cart reminder will appear here.
        </Empty>
      ) : (
        <Card className="overflow-hidden">
          <div className="divide-y divide-[#f0f0ec]">
            {emails.map((e) => (
              <div key={e.id}>
                <button
                  onClick={() => toggle(e.id)}
                  className="flex w-full flex-wrap items-center gap-3 px-5 py-3.5 text-left hover:bg-[#fafaf8]"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[14px] font-medium text-ink">
                      {e.subject || "(no subject)"}
                    </div>
                    <div className="truncate text-[12px] text-[#8a8a84]">
                      to {e.recipient} · {fmtDateTime(e.created_at)}
                    </div>
                  </div>
                  <TypeBadge type={e.type} />
                  {e.status === "sent" ? (
                    <span className="inline-flex items-center rounded-full bg-[#d9f2e3] px-2.5 py-[3px] text-[12px] font-semibold text-[#1f7a4d]">
                      Sent
                    </span>
                  ) : (
                    <span
                      className="inline-flex items-center rounded-full bg-[#f0d9d7] px-2.5 py-[3px] text-[12px] font-semibold text-[#9a2820]"
                      title={e.error ?? undefined}
                    >
                      Failed
                    </span>
                  )}
                  <span
                    className={`text-[#b3b3ac] transition-transform ${
                      openId === e.id ? "rotate-90" : ""
                    }`}
                  >
                    ›
                  </span>
                </button>
                {openId === e.id && (
                  <div className="border-t border-[#f0f0ec] bg-[#fbfbf9] px-5 py-4">
                    {e.error && (
                      <p className="mb-3 text-[13px] text-[#9a2820]">{e.error}</p>
                    )}
                    {preview?.id === e.id ? (
                      <iframe
                        title="Email preview"
                        sandbox=""
                        srcDoc={preview.html}
                        className="h-[520px] w-full rounded-lg border border-[#e8e8e4] bg-white"
                      />
                    ) : (
                      <div className="text-[13px] text-[#8a8a84]">Loading preview ...</div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}
    </>
  );
}
