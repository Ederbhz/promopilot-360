import { WhatsAppConnectionStatus, WhatsAppProvider } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { encryptJson } from "../lib/crypto.js";
import { asyncHandler, HttpError } from "../lib/http.js";
import { prisma } from "../lib/prisma.js";
import { jsonInput } from "../lib/sanitize.js";
import { testWhatsAppConnection } from "../services/whatsapp.js";

const router = Router();

const connectionSchema = z.object({
  name: z.string().min(2),
  phoneNumber: z.string().optional().nullable(),
  provider: z.nativeEnum(WhatsAppProvider).default(WhatsAppProvider.CLOUD_API),
  status: z.nativeEnum(WhatsAppConnectionStatus).optional(),
  phoneNumberId: z.string().optional().nullable(),
  credentials: z.record(z.unknown()).optional(),
  config: z.record(z.unknown()).optional(),
  isActive: z.boolean().default(true)
});

const groupSchema = z.object({
  connectionId: z.string().uuid(),
  name: z.string().min(2),
  externalId: z.string().min(2),
  type: z.string().default("GROUP"),
  isActive: z.boolean().default(true)
});

router.get(
  "/connections",
  asyncHandler(async (_req, res) => {
    const connections = await prisma.whatsAppConnection.findMany({
      include: { _count: { select: { groups: true } } },
      orderBy: { createdAt: "desc" }
    });
    res.json(connections.map(sanitizeConnection));
  })
);

router.post(
  "/connections",
  asyncHandler(async (req, res) => {
    const data = connectionSchema.parse(req.body);
    const connection = await prisma.whatsAppConnection.create({
      data: {
        name: data.name,
        phoneNumber: data.phoneNumber,
        provider: data.provider,
        status: data.status ?? inferStatus(data.provider, data.credentials, data.config),
        phoneNumberId: data.phoneNumberId,
        encryptedCredentials: data.credentials ? jsonInput(encryptJson(data.credentials)) : undefined,
        config: jsonInput(data.config),
        isActive: data.isActive
      },
      include: { _count: { select: { groups: true } } }
    });
    res.status(201).json(sanitizeConnection(connection));
  })
);

router.put(
  "/connections/:id",
  asyncHandler(async (req, res) => {
    const data = connectionSchema.partial().parse(req.body);
    const existing = await prisma.whatsAppConnection.findUnique({ where: { id: req.params.id } });
    if (!existing) throw new HttpError(404, "Conexao WhatsApp nao encontrada.");
    const connection = await prisma.whatsAppConnection.update({
      where: { id: req.params.id },
      data: {
        name: data.name,
        phoneNumber: data.phoneNumber,
        provider: data.provider,
        status:
          data.status ??
          (data.provider || data.credentials || data.config
            ? inferStatus(data.provider ?? existing.provider, data.credentials, data.config)
            : undefined),
        phoneNumberId: data.phoneNumberId,
        encryptedCredentials: data.credentials ? jsonInput(encryptJson(data.credentials)) : undefined,
        config: data.config === undefined ? undefined : jsonInput(data.config),
        isActive: data.isActive
      },
      include: { _count: { select: { groups: true } } }
    });
    res.json(sanitizeConnection(connection));
  })
);

router.post(
  "/connections/:id/test",
  asyncHandler(async (req, res) => {
    const connectionId = req.params.id!;
    const result = await testWhatsAppConnection(connectionId);
    await prisma.whatsAppConnection.update({
      where: { id: connectionId },
      data: { status: result.ok ? WhatsAppConnectionStatus.CONNECTED : WhatsAppConnectionStatus.WARNING }
    });
    res.json(result);
  })
);

router.get(
  "/groups",
  asyncHandler(async (_req, res) => {
    const groups = await prisma.whatsAppGroup.findMany({
      include: { connection: true },
      orderBy: { createdAt: "desc" }
    });
    res.json(groups.map((group) => ({ ...group, connection: sanitizeConnection(group.connection) })));
  })
);

router.post(
  "/groups",
  asyncHandler(async (req, res) => {
    const data = groupSchema.parse(req.body);
    const group = await prisma.whatsAppGroup.create({
      data,
      include: { connection: true }
    });
    res.status(201).json({ ...group, connection: sanitizeConnection(group.connection) });
  })
);

router.put(
  "/groups/:id",
  asyncHandler(async (req, res) => {
    const data = groupSchema.partial().parse(req.body);
    const group = await prisma.whatsAppGroup.update({
      where: { id: req.params.id },
      data,
      include: { connection: true }
    });
    res.json({ ...group, connection: sanitizeConnection(group.connection) });
  })
);

router.delete(
  "/groups/:id",
  asyncHandler(async (req, res) => {
    await prisma.whatsAppGroup.delete({ where: { id: req.params.id } });
    res.status(204).end();
  })
);

export default router;

function inferStatus(
  provider: WhatsAppProvider,
  credentials?: Record<string, unknown>,
  config?: Record<string, unknown>
) {
  if (provider === WhatsAppProvider.ASSISTED) return WhatsAppConnectionStatus.WARNING;
  const hasCredentials = Boolean(
    stringValue(credentials?.accessToken) ||
      stringValue(credentials?.apiToken) ||
      stringValue(credentials?.token) ||
      stringValue(config?.webhookUrl)
  );
  return hasCredentials ? WhatsAppConnectionStatus.CONNECTED : WhatsAppConnectionStatus.DISCONNECTED;
}

function sanitizeConnection<T extends { encryptedCredentials?: unknown }>(connection: T) {
  return {
    ...connection,
    encryptedCredentials: connection.encryptedCredentials ? { encrypted: true } : null
  };
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
