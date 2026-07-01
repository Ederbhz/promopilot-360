import { maskSecret } from "@promopilot/shared";
import { Prisma } from "@prisma/client";

export function sanitizeAffiliateAccount<T extends { encryptedCredentials?: unknown }>(account: T) {
  const masked = account.encryptedCredentials ? { encrypted: true, preview: maskSecret("configured") } : null;
  return {
    ...account,
    encryptedCredentials: masked
  };
}

export function toNumber(value: unknown): number | undefined {
  if (value === null || value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function jsonInput(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined) return undefined;
  return value as Prisma.InputJsonValue;
}
