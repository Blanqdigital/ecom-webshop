"use client";

import { useCallback, useEffect, useState } from "react";
import { Coupons } from "./Coupons";
import { FlowTimings } from "./FlowTimings";
import { type EmailRow, type FlowStats } from "./MarketingHelpers";
import { MarketingFlowCard } from "./MarketingFlowCard";
import { MarketingEmailLog } from "./MarketingEmailLog";

export function Marketing({ token }: { token: string }) {
  const [emails, setEmails] = useState<EmailRow[]>([]);
  const [ready, setReady] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [flow, setFlow] = useState<FlowStats | null>(null);
  const [flowReady, setFlowReady] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [logRes, flowRes] = await Promise.all([
        fetch("/api/admin/emails", {
          headers: { authorization: `Bearer ${token}` },
        }),
        fetch("/api/admin/flow", {
          headers: { authorization: `Bearer ${token}` },
        }),
      ]);
      const logData = await logRes.json();
      if (!logRes.ok) throw new Error(logData.error || "Couldn't load the email log.");
      setReady(logData.ready !== false);
      setEmails(logData.emails ?? []);
      const flowData = await flowRes.json();
      if (flowRes.ok && flowData.ready) setFlow(flowData.stats);
      else setFlowReady(flowData?.ready !== false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  if (error)
    return (
      <div className="rounded-xl border border-[#f0d9d7] bg-[#fdf6f5] px-5 py-4 text-[14px] text-[#9a2820]">
        {error}
      </div>
    );

  return (
    <div className="space-y-6">
      <FlowTimings token={token} />
      <MarketingFlowCard token={token} flow={flow} flowReady={flowReady} />
      <Coupons token={token} />
      <MarketingEmailLog
        token={token}
        emails={emails}
        ready={ready}
        loading={loading}
        onRefresh={load}
      />
    </div>
  );
}
