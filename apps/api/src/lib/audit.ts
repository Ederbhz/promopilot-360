import type { Request } from "express";
import { createHash } from "node:crypto";
import { prisma } from "./prisma.js";
import { jsonInput } from "./sanitize.js";

export async function recordAudit(
  req: Request,
  input: {
    entity: string;
    entityId?: string | null;
    action: string;
    before?: unknown;
    after?: unknown;
    metadata?: unknown;
  }
) {
  await prisma.auditLog.create({
    data: {
      userId: req.user?.id,
      entity: input.entity,
      entityId: input.entityId,
      action: input.action,
      before: jsonInput(input.before),
      after: jsonInput(input.after),
      metadata: jsonInput(input.metadata),
      ipHash: hashIp(req.ip)
    }
  });
}

function hashIp(ip: string | undefined) {
  if (!ip) return undefined;
  return createHash("sha256").update(ip).digest("hex");
}
