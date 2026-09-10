import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const PREFIX = "enc:v1:";

function encryptionKey(): Buffer {
  const value = process.env.INTEGRATIONS_ENCRYPTION_KEY?.trim() ?? "";
  if (!/^[a-f0-9]{64}$/i.test(value)) {
    throw new Error("Set INTEGRATIONS_ENCRYPTION_KEY to a 64-character random hex key before saving secrets.");
  }
  return Buffer.from(value, "hex");
}

export function secretStorageConfigured(): boolean {
  try { encryptionKey(); return true; } catch { return false; }
}

export function isEncryptedSecret(value: string): boolean {
  return value.startsWith(PREFIX);
}

/** Bind ciphertext to its setting name so rows cannot be swapped. */
export function encryptSecret(name: string, value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  cipher.setAAD(Buffer.from(name));
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return PREFIX + [iv, cipher.getAuthTag(), ciphertext].map(v => v.toString("base64url")).join(":");
}

export function decryptSecret(name: string, value: string): string {
  // Existing installations remain readable; re-saving migrates each legacy value.
  if (!isEncryptedSecret(value)) return value;
  const parts = value.slice(PREFIX.length).split(":");
  if (parts.length !== 3) throw new Error("Invalid encrypted setting");
  const [iv, tag, ciphertext] = parts.map(v => Buffer.from(v, "base64url"));
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), iv);
  decipher.setAAD(Buffer.from(name));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}
