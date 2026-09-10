import test from "node:test";
import assert from "node:assert/strict";
import { encryptSecret, decryptSecret, secretStorageConfigured } from "./secret-storage";

test("secret storage encrypts, authenticates setting names and detects tampering", () => {
  process.env.INTEGRATIONS_ENCRYPTION_KEY = "ab".repeat(32);
  const value = encryptSecret("stripe_secret_key", "test-secret-value");
  assert.ok(!value.includes("test-secret-value"));
  assert.notEqual(value, encryptSecret("stripe_secret_key", "test-secret-value"));
  assert.equal(decryptSecret("stripe_secret_key", value), "test-secret-value");
  assert.throws(() => decryptSecret("resend_api_key", value));
  assert.throws(() => decryptSecret("stripe_secret_key", value + "garbage"));
  process.env.INTEGRATIONS_ENCRYPTION_KEY = "cd".repeat(32);
  assert.throws(() => decryptSecret("stripe_secret_key", value));
  delete process.env.INTEGRATIONS_ENCRYPTION_KEY;
  assert.equal(secretStorageConfigured(), false);
  assert.throws(() => encryptSecret("key", "value"));
});
