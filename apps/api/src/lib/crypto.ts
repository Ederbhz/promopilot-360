import crypto from "node:crypto";
import { env } from "../config/env.js";

const algorithm = "aes-256-gcm";

function key() {
  return crypto.createHash("sha256").update(env.ENCRYPTION_KEY).digest();
}

export function encryptJson(value: unknown) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(algorithm, key(), iv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(value), "utf8"),
    cipher.final()
  ]);
  const tag = cipher.getAuthTag();

  return {
    algorithm,
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    data: encrypted.toString("base64")
  };
}

export function decryptJson<T>(payload: unknown): T | null {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, string>;
  if (!record.iv || !record.tag || !record.data) return null;

  const decipher = crypto.createDecipheriv(algorithm, key(), Buffer.from(record.iv, "base64"));
  decipher.setAuthTag(Buffer.from(record.tag, "base64"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(record.data, "base64")),
    decipher.final()
  ]);
  return JSON.parse(decrypted.toString("utf8")) as T;
}

export function hashIp(ip?: string): string | null {
  if (!ip) return null;
  return crypto.createHash("sha256").update(`${env.ENCRYPTION_KEY}:${ip}`).digest("hex");
}
