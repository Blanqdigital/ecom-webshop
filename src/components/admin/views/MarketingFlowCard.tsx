"use client";

import { useState } from "react";
import { Card, Empty } from "../ui";
import { type FlowStats, FlowNode, FlowArrow, SideStat } from "./MarketingHelpers";

export function MarketingFlowCard({
  token,
  flow,
  flowReady,
}: {
  token: string;
  flow: FlowStats | null;
  flowReady: boolean;
}) {
  const [templatePreview, setTemplatePreview] = useState<{
    key: string;
    subject: string;
    html: string;
  } | null>(null);

  async function toggleTemplate(key: "cart_reminder" | "cart_reminder_2") {
    if (templatePreview?.key === key) {
      setTemplatePreview(null);
      return;
    }
    try {
      const res = await fetch(`/api/admin/emails?template=${key}`, {
        headers: { authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok && data.email?.html) {
        setTemplatePreview({ key, subject: data.email.subject, html: data.email.html });
      }
    } catch {
      /* preview is best-effort */
    }
  }

  return (
    <Card className="p-6">
      <div className="mb-5 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[15px] font-semibold text-ink">Abandoned-cart flow</h2>
        <span className="text-[12.5px] text-[#8a8a84]">
          Shoppers who left an email at checkout without paying — nudged twice, then left alone.
        </span>
      </div>

      {!flowReady ? (
        <Empty>
          The flow needs the new <code className="rounded bg-[#eee] px-1">reminder2_sent_at</code>{" "}
          column — re-run <code className="rounded bg-[#eee] px-1">supabase/schema.sql</code> in
          Supabase (it&apos;s safe to run the whole file again).
        </Empty>
      ) : !flow ? (
        <div className="text-[14px] text-[#8a8a84]">Loading …</div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_240px]">
          <div>
            <FlowNode
              title="Cart captured"
              subtitle="Email entered at checkout, no payment"
              count={flow.captured}
              tone="#2A2622"
            />
            <FlowArrow label={`30 min later · ${flow.waitingFor1} waiting`} />
            <FlowNode
              title="Email 1 — Du glemte noe hos BÆRA 🧡"
              subtitle="The first nudge"
              count={flow.sent1}
              countLabel="sent"
              tone="#8a5a44"
              onPreview={() => toggleTemplate("cart_reminder")}
              previewOpen={templatePreview?.key === "cart_reminder"}
            />
            <FlowArrow label={`24 h later · ${flow.waitingFor2} waiting`} />
            <FlowNode
              title="Email 2 — Tilbudet ditt står fortsatt 🧡"
              subtitle="The final email; says so explicitly"
              count={flow.sent2}
              countLabel="sent"
              tone="#B84B36"
              onPreview={() => toggleTemplate("cart_reminder_2")}
              previewOpen={templatePreview?.key === "cart_reminder_2"}
            />
            <FlowArrow label="flow complete" />
            <FlowNode
              title="No purchase — left alone"
              subtitle="Went through the whole flow"
              count={flow.doneNoPurchase}
              tone="#8a8a84"
            />
          </div>

          <div className="space-y-3">
            <SideStat
              label="Recovered (purchased)"
              value={flow.converted}
              tone="#1f7a4d"
              detail={[
                `${flow.convertedBeforeEmail} before any email`,
                `${flow.convertedAfter1} after email 1`,
                `${flow.convertedAfter2} after email 2`,
              ]}
            />
            <SideStat
              label="Unsubscribed"
              value={flow.unsubscribed}
              tone="#9a2820"
              detail={["Excluded from all emails"]}
            />
          </div>
        </div>
      )}

      {templatePreview && (
        <div className="mt-5 rounded-xl border border-[#e8e8e4] bg-[#fbfbf9] p-4">
          <div className="mb-2 flex items-center justify-between gap-3">
            <span className="text-[13px] font-medium text-ink">
              Template preview — “{templatePreview.subject}”
            </span>
            <button
              onClick={() => setTemplatePreview(null)}
              className="text-[12.5px] font-medium text-clay hover:underline"
            >
              Close
            </button>
          </div>
          <iframe
            title="Template preview"
            sandbox=""
            srcDoc={templatePreview.html}
            className="h-[520px] w-full rounded-lg border border-[#e8e8e4] bg-white"
          />
        </div>
      )}
    </Card>
  );
}
