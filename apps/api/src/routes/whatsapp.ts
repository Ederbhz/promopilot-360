import { WhatsAppConnectionStatus, WhatsAppProvider } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { encryptJson } from "../lib/crypto.js";
import { asyncHandler, HttpError } from "../lib/http.js";
import { prisma } from "../lib/prisma.js";
import { jsonInput } from "../lib/sanitize.js";
import {
  closeWhatsAppSession,
  getWhatsAppSessionStatus,
  listAvailableWhatsAppGroups,
  logoutWhatsAppSession,
  restartWhatsAppSession,
  startWhatsAppSession,
  testWhatsAppConnection
} from "../services/whatsapp.js";

const router = Router();

const connectionSchema = z.object({
  name: z.string().min(2),
  sessionName: z.string().min(2).optional().nullable(),
  phoneNumber: z.string().optional().nullable(),
  status: z.nativeEnum(WhatsAppConnectionStatus).optional(),
  dailyLimit: z.coerce.number().int().min(1).max(500).default(100),
  minIntervalSeconds: z.coerce.number().int().min(10).max(86400).default(60),
  credentials: z.record(z.unknown()).optional(),
  config: z.record(z.unknown()).optional(),
  isActive: z.boolean().default(true)
});

const groupSchema = z.object({
  connectionId: z.string().uuid(),
  name: z.string().min(2),
  externalId: z.string().min(2),
  description: z.string().optional().nullable(),
  category: z.string().optional().nullable(),
  type: z.string().default("GROUP"),
  minIntervalSeconds: z.coerce.number().int().min(10).max(86400).default(60),
  dailyLimit: z.coerce.number().int().min(1).max(500).default(100),
  notes: z.string().optional().nullable(),
  isActive: z.boolean().default(true)
});

router.get(
  "/connections",
  asyncHandler(async (_req, res) => {
    const connections = await prisma.whatsAppConnection.findMany({
      where: { provider: WhatsAppProvider.WPPCONNECT },
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
    const sessionName = normalizeSessionName(data.sessionName ?? data.name);
    const connection = await prisma.whatsAppConnection.create({
      data: {
        name: data.name,
        sessionName,
        phoneNumber: data.phoneNumber,
        provider: WhatsAppProvider.WPPCONNECT,
        status: data.status ?? inferStatus(data.credentials),
        dailyLimit: data.dailyLimit,
        minIntervalSeconds: data.minIntervalSeconds,
        encryptedCredentials: data.credentials ? jsonInput(encryptJson(data.credentials)) : undefined,
        config: jsonInput({ ...data.config, sessionName }),
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
    const sessionName =
      data.sessionName === null ? null : data.sessionName ? normalizeSessionName(data.sessionName) : undefined;
    const config =
      data.config === undefined
        ? undefined
        : jsonInput({ ...data.config, ...(sessionName ? { sessionName } : {}) });
    const connection = await prisma.whatsAppConnection.update({
      where: { id: req.params.id },
      data: {
        name: data.name,
        sessionName,
        phoneNumber: data.phoneNumber,
        provider: WhatsAppProvider.WPPCONNECT,
        status:
          data.status ??
          (data.credentials || data.config ? inferStatus(data.credentials) : undefined),
        dailyLimit: data.dailyLimit,
        minIntervalSeconds: data.minIntervalSeconds,
        encryptedCredentials: data.credentials ? jsonInput(encryptJson(data.credentials)) : undefined,
        config,
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
      data: { status: result.ok ? WhatsAppConnectionStatus.CONNECTED : normalizeReturnedStatus(result.status) }
    });
    res.json(result);
  })
);

router.post(
  "/connections/:id/start",
  asyncHandler(async (req, res) => {
    const connection = await startWhatsAppSession(req.params.id!);
    res.json(sanitizeConnection(connection));
  })
);

router.get(
  "/connections/:id/session/status",
  asyncHandler(async (req, res) => {
    const connection = await getWhatsAppSessionStatus(req.params.id!);
    res.json(sanitizeConnection(connection));
  })
);

router.post(
  "/connections/:id/logout",
  asyncHandler(async (req, res) => {
    const result = await logoutWhatsAppSession(req.params.id!);
    res.json({ ...result, connection: sanitizeConnection(result.connection) });
  })
);

router.post(
  "/connections/:id/close",
  asyncHandler(async (req, res) => {
    const result = await closeWhatsAppSession(req.params.id!);
    res.json({ ...result, connection: sanitizeConnection(result.connection) });
  })
);

router.post(
  "/connections/:id/restart",
  asyncHandler(async (req, res) => {
    const connection = await restartWhatsAppSession(req.params.id!);
    res.json(sanitizeConnection(connection));
  })
);

router.get(
  "/connections/:id/available-groups",
  asyncHandler(async (req, res) => {
    res.json(await listAvailableWhatsAppGroups(req.params.id!));
  })
);

router.post(
  "/session/start",
  asyncHandler(async (req, res) => {
    const connection = await startWhatsAppSession(await resolveWppConnectionId(req));
    res.json(sanitizeConnection(connection));
  })
);

router.get(
  "/session/status",
  asyncHandler(async (req, res) => {
    const connection = await getWhatsAppSessionStatus(await resolveWppConnectionId(req));
    res.json(sanitizeConnection(connection));
  })
);

router.post(
  "/session/logout",
  asyncHandler(async (req, res) => {
    const result = await logoutWhatsAppSession(await resolveWppConnectionId(req));
    res.json({ ...result, connection: sanitizeConnection(result.connection) });
  })
);

router.post(
  "/session/restart",
  asyncHandler(async (req, res) => {
    const connection = await restartWhatsAppSession(await resolveWppConnectionId(req));
    res.json(sanitizeConnection(connection));
  })
);

router.get(
  "/groups",
  asyncHandler(async (_req, res) => {
    const groups = await prisma.whatsAppGroup.findMany({
      where: { connection: { provider: WhatsAppProvider.WPPCONNECT } },
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
    await ensureWppConnection(data.connectionId);
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
    if (data.connectionId) await ensureWppConnection(data.connectionId);
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
    await prisma.whatsAppGroup.update({
      where: { id: req.params.id },
      data: { isActive: false }
    });
    res.status(204).end();
  })
);

export default router;

async function resolveWppConnectionId(req: { body?: unknown; query?: Record<string, unknown> }) {
  const body = req.body && typeof req.body === "object" ? (req.body as Record<string, unknown>) : {};
  const provided = stringValue(body.connectionId) ?? stringValue(req.query?.connectionId);
  if (provided) return provided;
  const connection = await prisma.whatsAppConnection.findFirst({
    where: { provider: WhatsAppProvider.WPPCONNECT, isActive: true },
    orderBy: { createdAt: "desc" }
  });
  if (!connection) throw new HttpError(404, "Cadastre uma conexao WPPConnect primeiro.");
  return connection.id;
}

async function ensureWppConnection(connectionId: string) {
  const connection = await prisma.whatsAppConnection.findUnique({ where: { id: connectionId } });
  if (!connection || connection.provider !== WhatsAppProvider.WPPCONNECT) {
    throw new HttpError(400, "Selecione uma conexao WPPConnect valida.");
  }
}

function inferStatus(credentials?: Record<string, unknown>) {
  return stringValue(credentials?.token) || stringValue(credentials?.secretKey)
    ? WhatsAppConnectionStatus.DISCONNECTED
    : WhatsAppConnectionStatus.DISCONNECTED;
}

function sanitizeConnection<T extends { encryptedCredentials?: unknown }>(connection: T) {
  return {
    ...connection,
    encryptedCredentials: connection.encryptedCredentials ? { encrypted: true } : null
  };
}

function normalizeSessionName(value: string) {
  return value.trim().replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 120) || "promopilot360";
}

function normalizeReturnedStatus(value: unknown) {
  const status = stringValue(value);
  if (status && Object.values(WhatsAppConnectionStatus).includes(status as WhatsAppConnectionStatus)) {
    return status as WhatsAppConnectionStatus;
  }
  return WhatsAppConnectionStatus.WARNING;
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
