"use client";

import { useCallback, useEffect, useState } from "react";
import { Card } from "../ui";
import {
  type IntegrationKey,
  SECRET_KEYS,
  GROUPS,
} from "./integrationsFields";
import { ShopifyWebhooksCard } from "./ShopifyWebhooksCard";
import { ConnectionChecks } from "./ConnectionChecks";

interface IntegrationStatus {
  configured: boolean;
  envOverride: boolean;
  value?: string;
  masked?: string;
  storage?: string;
}

export function Integrations({ token }: { token: string }) {
  const [status, setStatus] = useState<Record<IntegrationKey, IntegrationStatus> | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [dirtySecrets, setDirtySecrets] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/integrations", {
        headers: { authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't load integrations.");
      const integrations = data.integrations as Record<IntegrationKey, IntegrationStatus>;
      setStatus(integrations);
      const next: Record<string, string> = {};
      for (const [k, v] of Object.entries(integrations)) {
        if (SECRET_KEYS.has(k as IntegrationKey)) next[k] = "";
        else if (k === "vipps_enabled") next[k] = v.value === "1" ? "1" : "";
        else next[k] = v.value ?? "";
      }
      setDraft(next);
      setDirtySecrets(new Set());
    } catch (e) {
      setError((e as Error).message);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  function setField(key: IntegrationKey, value: string) {
    setDraft((d) => ({ ...d, [key]: value }));
    if (SECRET_KEYS.has(key)) setDirtySecrets((s) => new Set(s).add(key));
  }

  async function save() {
    if (!status) return;
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const body: Record<string, string> = {};
      for (const group of GROUPS) {
        for (const f of group.fields) {
          if (status[f.key]?.envOverride) continue;
          if (SECRET_KEYS.has(f.key)) {
            if (dirtySecrets.has(f.key)) body[f.key] = draft[f.key] ?? "";
          } else {
            body[f.key] = draft[f.key] ?? "";
          }
        }
      }
      const res = await fetch("/api/admin/integrations", {
        method: "PUT",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't save.");
      setStatus(data.integrations);
      setDirtySecrets(new Set());
      setDraft((d) => {
        const next = { ...d };
        for (const k of SECRET_KEYS) {
          if (body[k] !== undefined) next[k] = "";
        }
        return next;
      });
      setMessage("Saved. Connection has not been tested. Changes apply within 60 seconds.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Card className="p-5">
        <p className="text-[13.5px] leading-relaxed text-[#6b6b66]">
          Save credentials here, then test each connection. Secrets are encrypted using
          the hosting encryption key. Environment overrides lock the corresponding field.
          Saving a value does not verify payments, delivery or fulfilment.

        </p>
      </Card>

      {error && <p className="text-[13px] text-[#9a2820]">{error}</p>}
      {!status && !error ? (
        <p className="text-[13.5px] text-[#8a8a84]">Loading ...</p>
      ) : status ? (
        <>
          {GROUPS.map((g) => (
            <Card key={g.title} className="p-6">
              <h2 className="mb-1 text-[15px] font-semibold text-ink">{g.title}</h2>
              <p className="mb-4 text-[12.5px] text-[#8a8a84]">{g.blurb}</p>
              <div className="space-y-4">
                {g.fields.map((f) => {
                  const st = status[f.key];
                  const locked = !!st?.envOverride;
                  const isSecret = SECRET_KEYS.has(f.key);
                  return (
                    <div key={f.key}>
                      <label className="mb-1 block text-[13px] font-medium text-ink">
                        {f.label}
                        {locked && (
                          <span className="ml-2 rounded bg-[#f3ead9] px-1.5 py-0.5 text-[10.5px] font-semibold text-[#8a6a2f]">
                            set by env var - field disabled
                          </span>
                        )}
                        {!locked && isSecret && st?.configured && (
                          <span className="ml-2 rounded bg-[#eef0ee] px-1.5 py-0.5 text-[10.5px] font-semibold text-[#4a4a45]">
                            {st.masked || "**** set"}
                          </span>
                        )}
                      </label>
                      {f.type === "toggle" ? (
                        <label className="flex items-center gap-2 text-[13.5px] text-ink">
                          <input
                            type="checkbox"
                            checked={(draft[f.key] ?? "") === "1"}
                            disabled={locked}
                            onChange={(e) => setField(f.key, e.target.checked ? "1" : "")}
                            className="h-4 w-4 rounded border-[#e2e2dd]"
                          />
                          Enabled
                        </label>
                      ) : f.type === "select" ? (
                        <select
                          value={draft[f.key] || "test"}
                          disabled={locked}
                          onChange={(e) => setField(f.key, e.target.value)}
                          className="w-full rounded-lg border border-[#e2e2dd] px-3 py-2 text-[13.5px] text-ink outline-none focus:border-ink disabled:bg-[#f3f3ef] disabled:text-[#8a8a84]"
                        >
                          {(f.options ?? []).map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type={isSecret ? "password" : "text"}
                          value={draft[f.key] ?? ""}
                          placeholder={
                            isSecret && st?.configured && !dirtySecrets.has(f.key)
                              ? "**** set - type to replace"
                              : f.placeholder
                          }
                          disabled={locked}
                          autoComplete="off"
                          onChange={(e) => setField(f.key, e.target.value)}
                          className="w-full rounded-lg border border-[#e2e2dd] px-3 py-2 text-[13.5px] text-ink outline-none transition-colors focus:border-ink disabled:bg-[#f3f3ef] disabled:text-[#8a8a84]"
                        />
                      )}
                      {st?.storage === "legacy" && <p className="text-sm text-amber-700">Legacy plaintext value. Enter it again and save to encrypt it.</p>}
                      {st?.storage === "unreadable" && <p className="text-sm text-red-700">Cannot decrypt this value. Restore the hosting encryption key.</p>}
                      {f.hint && <p className="mt-1 text-[11.5px] text-[#a3a39c]">{f.hint}</p>}
                      {isSecret && !locked && (
                        <p className="mt-1 text-[11px] text-[#a3a39c]">
                          Leave blank and save to clear. Unchanged secrets are not sent.
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </Card>
          ))}

          <ShopifyWebhooksCard token={token} />
          <ConnectionChecks token={token} />

          <div className="flex items-center gap-3 pb-8">
            <button
              onClick={save}
              disabled={saving}
              className="rounded-lg bg-ink px-4 py-2 text-[13.5px] font-semibold text-cream transition-colors hover:bg-clay disabled:opacity-50"
            >
              {saving ? "Saving ..." : "Save integrations"}
            </button>
            {message && <span className="text-[12.5px] text-[#1f7a4d]">{message}</span>}
          </div>
        </>
      ) : null}
    </div>
  );
}
