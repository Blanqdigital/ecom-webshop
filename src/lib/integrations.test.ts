import test from "node:test";
import assert from "node:assert/strict";
import { encryptSecret } from "./secret-storage";

test("admin-saved encrypted tokens are used by runtime and never exposed in status", async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.invalid";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role";
  process.env.INTEGRATIONS_ENCRYPTION_KEY = "ab".repeat(32);
  for (const key of ["ORDER_TOKEN_SECRET", "EMAIL_UNSUB_SECRET", "CRON_SECRET", "STRIPE_WEBHOOK_SECRET"]) delete process.env[key];
  const originalFetch = globalThis.fetch;
  const secret = "test-only-order-token-secret-long-value";
  let rows = [{ key: "order_token_secret", value: encryptSecret("order_token_secret", secret) }];
  globalThis.fetch = async (input) => {
    assert.ok(String(input).startsWith("https://test.invalid/"));
    return new Response(JSON.stringify(rows), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const integrations = await import("./integrations");
    const tokens = await import("./order-token");
    assert.equal(await integrations.getIntegration("order_token_secret"), secret);
    const status = await integrations.getIntegrationStatus();
    assert.equal(status.order_token_secret.storage, "encrypted");
    assert.ok(!JSON.stringify(status).includes(secret));
    const token = await tokens.orderToken("pi_example");
    assert.equal(await tokens.readOrderToken(token), "pi_example");
    assert.equal(await tokens.readOrderToken(token + "bad"), null);
    rows = [];
    integrations.invalidateIntegrationsCache();
    assert.equal(await tokens.orderTokensConfigured(), false);
    await assert.rejects(tokens.orderToken("pi_example"));
    assert.equal(await tokens.readOrderToken(token), null);
  } finally { globalThis.fetch = originalFetch; }
});
