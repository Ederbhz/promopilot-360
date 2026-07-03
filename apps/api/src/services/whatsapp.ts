import {
  type WhatsAppConnection,
  type WhatsAppGroup,
  WhatsAppConnectionStatus,
  type WhatsAppProvider
} from "@prisma/client";
import { env } from "../config/env.js";
import { decryptJson, encryptJson } from "../lib/crypto.js";
import { prisma } from "../lib/prisma.js";
import { jsonInput } from "../lib/sanitize.js";

export interface WhatsAppSendInput {
  groupId: string;
  message: string;
  imageUrl?: string | null;
  scheduledPostId?: string;
}

interface ProviderResult {
  ok?: boolean;
  [key: string]: unknown;
}

const wppTokenCache = new Map<string, string>();

export class WhatsAppRateLimitError extends Error {
  constructor(
    message: string,
    public readonly nextAllowedAt: Date
  ) {
    super(message);
  }
}

export async function sendWhatsAppMessage(input: WhatsAppSendInput) {
  const group = await prisma.whatsAppGroup.findUnique({
    where: { id: input.groupId },
    include: { connection: true }
  });
  if (!group) throw new Error("Grupo de WhatsApp nao encontrado.");
  if (!group.isActive || !group.connection.isActive) throw new Error("Grupo ou conexao de WhatsApp inativo.");

  try {
    const config = toRecord(group.connection.config);
    const messageType = stringValue(config.messageType) ?? "TEXT_IMAGE";
    ensureProvider(group.connection.provider, "WPPCONNECT");
    return await sendWppConnectGroupMessage({
      connection: group.connection,
      group,
      message: input.message,
      imageUrl: messageType === "TEXT_IMAGE" ? input.imageUrl : undefined
    });
  } catch (error) {
    if (!(error instanceof WhatsAppRateLimitError)) {
      await registerConnectionFailure(group.connection.id, error);
    }
    throw error;
  }
}

export async function testWhatsAppConnection(connectionId: string) {
  const connection = await findConnection(connectionId);
  ensureProvider(connection.provider, "WPPCONNECT");
  const status = await getWhatsAppSessionStatus(connection.id);
  return {
    ok: status.status === WhatsAppConnectionStatus.CONNECTED,
    mode: "WPPCONNECT",
    message:
      status.status === WhatsAppConnectionStatus.CONNECTED
        ? "Sessao WPPConnect conectada."
        : "Sessao WPPConnect ainda nao conectada.",
    status: status.status,
    qrCode: status.qrCode
  };
}

export async function startWhatsAppSession(connectionId: string) {
  return withWppSessionErrorTracking(connectionId, async () => {
    const connection = await findConnection(connectionId);
    ensureProvider(connection.provider, "WPPCONNECT");
    const session = resolveSessionName(connection);
    await ensureWppToken(connection);

    const config = toRecord(connection.config);
    const payload = await wppRequest(connection, `/api/${encodeURIComponent(session)}/start-session`, {
      method: "POST",
      body: JSON.stringify({
        webhook: stringValue(config.webhookUrl) ?? "",
        waitQrCode: false
      })
    });

    const qrPayload = await waitForWppQrCode(connection);
    const qrCode = extractQrCode(qrPayload) ?? extractQrCode(payload);
    const status = normalizeWppStatus(qrPayload ?? payload, qrCode);
    return updateConnectionSession(connection.id, {
      status,
      qrCode,
      lastConnectedAt: status === WhatsAppConnectionStatus.CONNECTED ? new Date() : undefined,
      lastError: null,
      sessionName: session,
      isActive: true
    });
  });
}

export async function getWhatsAppSessionStatus(connectionId: string) {
  return withWppSessionErrorTracking(connectionId, async () => {
    const connection = await findConnection(connectionId);
    ensureProvider(connection.provider, "WPPCONNECT");
    const session = resolveSessionName(connection);
    await ensureWppToken(connection);

    const payload = await wppRequest(connection, `/api/${encodeURIComponent(session)}/status-session`, {
      method: "GET"
    });
    const status = normalizeWppStatus(payload);
    const qrPayload =
      status === WhatsAppConnectionStatus.CONNECTED ? undefined : await tryGetWppQrCode(connection);
    const qrCode = extractQrCode(qrPayload) ?? extractQrCode(payload);
    const normalizedStatus = normalizeWppStatus(qrPayload ?? payload, qrCode);
    return updateConnectionSession(connection.id, {
      status: normalizedStatus,
      qrCode,
      lastConnectedAt:
        normalizedStatus === WhatsAppConnectionStatus.CONNECTED ? new Date() : (connection.lastConnectedAt ?? undefined),
      lastError: null,
      sessionName: session
    });
  });
}

export async function logoutWhatsAppSession(connectionId: string) {
  return withWppSessionErrorTracking(connectionId, async () => {
    const connection = await findConnection(connectionId);
    ensureProvider(connection.provider, "WPPCONNECT");
    const session = resolveSessionName(connection);
    await ensureWppToken(connection);
    const payload = await wppRequest(connection, `/api/${encodeURIComponent(session)}/logout-session`, {
      method: "POST"
    });
    const updated = await updateConnectionSession(connection.id, {
      status: WhatsAppConnectionStatus.DISCONNECTED,
      qrCode: null,
      lastError: null
    });
    return { connection: updated, providerResponse: payload };
  });
}

export async function closeWhatsAppSession(connectionId: string) {
  return withWppSessionErrorTracking(connectionId, async () => {
    const connection = await findConnection(connectionId);
    ensureProvider(connection.provider, "WPPCONNECT");
    const session = resolveSessionName(connection);
    await ensureWppToken(connection);
    const payload = await wppRequest(connection, `/api/${encodeURIComponent(session)}/close-session`, {
      method: "POST"
    });
    const updated = await updateConnectionSession(connection.id, {
      status: WhatsAppConnectionStatus.DISCONNECTED,
      qrCode: null,
      lastError: null
    });
    return { connection: updated, providerResponse: payload };
  });
}

export async function restartWhatsAppSession(connectionId: string) {
  await closeWhatsAppSession(connectionId).catch(() => undefined);
  return startWhatsAppSession(connectionId);
}

export async function listAvailableWhatsAppGroups(connectionId: string) {
  return withWppSessionErrorTracking(connectionId, async () => {
    const connection = await findConnection(connectionId);
    ensureProvider(connection.provider, "WPPCONNECT");
    const session = resolveSessionName(connection);
    await ensureWppToken(connection);

    const payload = await wppRequest(connection, `/api/${encodeURIComponent(session)}/list-chats`, {
      method: "POST",
      body: JSON.stringify({
        count: 100,
        onlyGroups: true,
        onlyUsers: false,
        onlyWithUnreadMessage: false
      })
    });
    return readWppGroups(payload);
  });
}

async function sendWppConnectGroupMessage(input: {
  connection: WhatsAppConnection;
  group: WhatsAppGroup;
  message: string;
  imageUrl?: string | null;
}) {
  const status = input.connection.status === WhatsAppConnectionStatus.CONNECTED
    ? input.connection
    : await getWhatsAppSessionStatus(input.connection.id);
  if (status.status !== WhatsAppConnectionStatus.CONNECTED) {
    throw new Error("Sessao WhatsApp nao conectada. Leia o QR Code antes de enviar.");
  }

  enforceSendLimits(input.connection, input.group);
  const session = resolveSessionName(input.connection);
  let response: ProviderResult;

  if (input.imageUrl) {
    const image = await fetchImageAsBase64(input.imageUrl).catch(() => undefined);
    if (image) {
      response = await wppRequest(input.connection, `/api/${encodeURIComponent(session)}/send-image`, {
        method: "POST",
        body: JSON.stringify({
          phone: input.group.externalId,
          isGroup: true,
          isNewsletter: false,
          isLid: false,
          filename: "oferta.jpg",
          caption: input.message,
          base64: image
        })
      });
    } else {
      response = await sendWppText(input.connection, input.group.externalId, input.message);
    }
  } else {
    response = await sendWppText(input.connection, input.group.externalId, input.message);
  }

  await registerSuccessfulSend(input.connection, input.group);
  return response;
}

async function sendWppText(connection: WhatsAppConnection, groupExternalId: string, message: string) {
  const session = resolveSessionName(connection);
  return wppRequest(connection, `/api/${encodeURIComponent(session)}/send-message`, {
    method: "POST",
    body: JSON.stringify({
      phone: groupExternalId,
      isGroup: true,
      isNewsletter: false,
      isLid: false,
      message
    })
  });
}

async function wppRequest(connection: WhatsAppConnection, path: string, init: RequestInit = {}) {
  const token = await ensureWppToken(connection);
  const response = await fetch(`${resolveWppBaseUrl(connection)}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      ...init.headers
    }
  });
  return readProviderResponse(response, "WPPConnect Server");
}

async function tryGetWppQrCode(connection: WhatsAppConnection) {
  try {
    const session = resolveSessionName(connection);
    return await wppRequest(connection, `/api/${encodeURIComponent(session)}/qrcode-session`, {
      method: "GET"
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "QRCode indisponivel." };
  }
}

async function waitForWppQrCode(connection: WhatsAppConnection) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const payload = await tryGetWppQrCode(connection);
    if (extractQrCode(payload) || normalizeWppStatus(payload) === WhatsAppConnectionStatus.CONNECTED) {
      return payload;
    }
    await delay(1200);
  }
  return tryGetWppQrCode(connection);
}

async function ensureWppToken(connection: WhatsAppConnection) {
  const cacheKey = `${connection.id}:${connection.updatedAt.getTime()}`;
  const cached = wppTokenCache.get(cacheKey);
  if (cached) return cached;
  const credentials = safeDecrypt(connection.encryptedCredentials);
  const config = toRecord(connection.config);
  const existing =
    stringValue(credentials.token) ??
    stringValue(credentials.apiToken) ??
    stringValue(config.token) ??
    stringValue(config.apiToken);
  if (existing) {
    wppTokenCache.set(cacheKey, existing);
    return existing;
  }

  const secretKey = stringValue(credentials.secretKey) ?? stringValue(config.secretKey) ?? env.WPP_SECRET_KEY;
  if (!secretKey) {
    throw new Error("Informe WPP_SECRET_KEY ou a chave secreta da conexao WPPConnect.");
  }

  const session = resolveSessionName(connection);
  const response = await fetch(
    `${resolveWppBaseUrl(connection)}/api/${encodeURIComponent(session)}/${encodeURIComponent(secretKey)}/generate-token`,
    { method: "POST" }
  );
  const payload = await readProviderResponse(response, "WPPConnect Server");
  const token = stringValue(payload.token) ?? stringValue(payload.full)?.split(":").pop();
  if (!token) throw new Error("WPPConnect nao retornou token de sessao.");

  await prisma.whatsAppConnection.update({
    where: { id: connection.id },
    data: {
      encryptedCredentials: jsonInput(encryptJson({ ...credentials, token }))
    }
  });
  wppTokenCache.set(cacheKey, token);
  return token;
}

async function withWppSessionErrorTracking<T>(connectionId: string, action: () => Promise<T>) {
  try {
    return await action();
  } catch (error) {
    await markWppSessionError(connectionId, error);
    throw error;
  }
}

async function markWppSessionError(connectionId: string, error: unknown) {
  const message = error instanceof Error ? error.message : "Erro desconhecido.";
  await prisma.whatsAppConnection
    .update({
      where: { id: connectionId },
      data: {
        status: WhatsAppConnectionStatus.ERROR,
        lastError: message
      }
    })
    .catch(() => undefined);
}

async function updateConnectionSession(
  id: string,
  data: {
    status: WhatsAppConnectionStatus;
    qrCode?: string | null;
    lastConnectedAt?: Date;
    lastError?: string | null;
    sessionName?: string;
    isActive?: boolean;
  }
) {
  return prisma.whatsAppConnection.update({
    where: { id },
    data: {
      status: data.status,
      qrCode: data.qrCode,
      lastConnectedAt: data.lastConnectedAt,
      lastError: data.lastError,
      sessionName: data.sessionName,
      isActive: data.isActive,
      consecutiveFailures: data.status === WhatsAppConnectionStatus.CONNECTED ? 0 : undefined
    }
  });
}

async function registerSuccessfulSend(connection: WhatsAppConnection, group: WhatsAppGroup) {
  const now = new Date();
  const connectionCount = nextDailyCount(connection.dailyWindowStartedAt, connection.dailySentCount, now);
  const groupCount = nextDailyCount(group.dailyWindowStartedAt, group.dailySentCount, now);
  await prisma.$transaction([
    prisma.whatsAppConnection.update({
      where: { id: connection.id },
      data: {
        status: WhatsAppConnectionStatus.CONNECTED,
        lastSentAt: now,
        dailySentCount: connectionCount.count,
        dailyWindowStartedAt: connectionCount.windowStartedAt,
        consecutiveFailures: 0,
        lastError: null
      }
    }),
    prisma.whatsAppGroup.update({
      where: { id: group.id },
      data: {
        lastSentAt: now,
        dailySentCount: groupCount.count,
        dailyWindowStartedAt: groupCount.windowStartedAt
      }
    })
  ]);
}

async function registerConnectionFailure(connectionId: string, error: unknown) {
  const connection = await prisma.whatsAppConnection.findUnique({ where: { id: connectionId } });
  if (!connection) return;
  const message = error instanceof Error ? error.message : "Erro desconhecido.";
  const failures = connection.consecutiveFailures + 1;
  const shouldPause = failures >= env.WHATSAPP_MAX_CONSECUTIVE_FAILURES;
  await prisma.whatsAppConnection.update({
    where: { id: connectionId },
    data: {
      consecutiveFailures: failures,
      lastError: message,
      status: shouldPause ? WhatsAppConnectionStatus.ERROR : WhatsAppConnectionStatus.WARNING,
      isActive: shouldPause ? false : undefined
    }
  });
}

function enforceSendLimits(connection: WhatsAppConnection, group: WhatsAppGroup) {
  const now = new Date();
  const connectionCount = currentDailyCount(connection.dailyWindowStartedAt, connection.dailySentCount, now);
  const groupCount = currentDailyCount(group.dailyWindowStartedAt, group.dailySentCount, now);
  if (connectionCount >= connection.dailyLimit) {
    throw new WhatsAppRateLimitError("Limite diario da sessao WhatsApp atingido.", nextDayStart(now));
  }
  if (groupCount >= group.dailyLimit) {
    throw new WhatsAppRateLimitError("Limite diario do grupo WhatsApp atingido.", nextDayStart(now));
  }

  const nextConnectionSlot = nextIntervalSlot(connection.lastSentAt, connection.minIntervalSeconds, now);
  const nextGroupSlot = nextIntervalSlot(group.lastSentAt, group.minIntervalSeconds, now);
  const nextAllowedAt = latestDate(nextConnectionSlot, nextGroupSlot);
  if (nextAllowedAt && nextAllowedAt > now) {
    throw new WhatsAppRateLimitError("Intervalo minimo entre envios ainda nao foi atingido.", nextAllowedAt);
  }
}

function normalizeWppStatus(payload?: unknown, qrCode?: string | null) {
  const record = toRecord(payload);
  const raw = String(record.status ?? record.state ?? record.response ?? record.message ?? "").toUpperCase();
  if (raw.includes("CONNECTED") || raw.includes("ISLOGGED")) return WhatsAppConnectionStatus.CONNECTED;
  if (qrCode || raw.includes("QRCODE") || raw.includes("QR_CODE") || raw.includes("INITIALIZING")) {
    return WhatsAppConnectionStatus.WAITING_QR_CODE;
  }
  if (raw.includes("AUTH")) return WhatsAppConnectionStatus.AUTH_ERROR;
  if (raw.includes("EXPIRED") || raw.includes("AUTO_CLOSE")) return WhatsAppConnectionStatus.EXPIRED;
  if (raw.includes("ERROR") || raw.includes("FAIL")) return WhatsAppConnectionStatus.ERROR;
  return WhatsAppConnectionStatus.DISCONNECTED;
}

function extractQrCode(payload?: unknown) {
  const record = toRecord(payload);
  const direct =
    stringValue(record.qrcode) ??
    stringValue(record.qrCode) ??
    stringValue(record.base64Qr) ??
    stringValue(record.base64) ??
    stringValue(record.image);
  if (direct?.startsWith("data:image")) return direct;
  if (direct && direct.length > 100) return `data:image/png;base64,${direct.replace(/^data:.+;base64,/, "")}`;
  const raw = stringValue(record.raw);
  if (raw?.startsWith("data:image")) return raw;
  return undefined;
}

function readWppGroups(payload: unknown) {
  const record = toRecord(payload);
  const candidates = firstArray(payload, record.response, record.data, record.chats, record.result);
  return candidates
    .map((item) => toRecord(item))
    .map((item) => ({
      externalId:
        stringValue(item.id) ??
        stringValue(toRecord(item.id)._serialized) ??
        stringValue(item.wid) ??
        stringValue(toRecord(item.wid)._serialized),
      name:
        stringValue(item.name) ??
        stringValue(item.formattedTitle) ??
        stringValue(toRecord(item.contact).formattedName) ??
        stringValue(item.pushname) ??
        "Grupo WhatsApp"
    }))
    .filter((group) => group.externalId?.includes("@g.us"))
    .map((group) => ({ externalId: group.externalId!, name: group.name }));
}

async function fetchImageAsBase64(url: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Imagem respondeu ${response.status}.`);
  const contentType = response.headers.get("content-type") || "image/jpeg";
  const buffer = Buffer.from(await response.arrayBuffer());
  return `data:${contentType};base64,${buffer.toString("base64")}`;
}

async function readProviderResponse(response: Response, provider: string) {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.startsWith("image/")) {
    const buffer = Buffer.from(await response.arrayBuffer());
    return { qrcode: `data:${contentType};base64,${buffer.toString("base64")}` };
  }
  const text = await response.text();
  const payload = safeJson(text);
  if (!response.ok) {
    throw new Error(`${provider} recusou a requisicao (${response.status}): ${readProviderError(payload, text)}`);
  }
  return (payload ?? { ok: true }) as ProviderResult;
}

function resolveWppBaseUrl(connection: WhatsAppConnection) {
  const config = toRecord(connection.config);
  return (stringValue(config.apiBaseUrl) ?? env.WPP_SERVER_URL).replace(/\/+$/, "");
}

function resolveSessionName(connection: WhatsAppConnection) {
  const config = toRecord(connection.config);
  return (
    connection.sessionName ??
    stringValue(config.sessionName) ??
    `${env.WPP_SESSION_NAME}-${connection.id.slice(0, 8)}`
  ).replace(/[^a-zA-Z0-9_-]/g, "_");
}

function ensureProvider(provider: WhatsAppProvider, expected: WhatsAppProvider) {
  if (provider !== expected) throw new Error("Esta conexao nao usa WPPConnect.");
}

async function findConnection(id: string) {
  const connection = await prisma.whatsAppConnection.findUnique({ where: { id } });
  if (!connection) throw new Error("Conexao WhatsApp nao encontrada.");
  return connection;
}

function currentDailyCount(windowStartedAt: Date | null, count: number, now: Date) {
  return isSameLocalDay(windowStartedAt, now) ? count : 0;
}

function nextDailyCount(windowStartedAt: Date | null, count: number, now: Date) {
  if (isSameLocalDay(windowStartedAt, now)) {
    return { count: count + 1, windowStartedAt };
  }
  return { count: 1, windowStartedAt: now };
}

function nextIntervalSlot(lastSentAt: Date | null, intervalSeconds: number, now: Date) {
  if (!lastSentAt) return null;
  const next = new Date(lastSentAt.getTime() + Math.max(intervalSeconds, env.WHATSAPP_DEFAULT_INTERVAL_SECONDS) * 1000);
  return next > now ? next : null;
}

function latestDate(...dates: Array<Date | null>) {
  return dates.filter((date): date is Date => Boolean(date)).sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
}

function nextDayStart(now: Date) {
  const next = new Date(now);
  next.setDate(next.getDate() + 1);
  next.setHours(0, 0, 0, 0);
  return next;
}

function isSameLocalDay(value: Date | null, now: Date) {
  if (!value) return false;
  return (
    value.getFullYear() === now.getFullYear() &&
    value.getMonth() === now.getMonth() &&
    value.getDate() === now.getDate()
  );
}

function safeDecrypt(payload: unknown): Record<string, unknown> {
  try {
    return toRecord(decryptJson<Record<string, unknown>>(payload));
  } catch {
    return {};
  }
}

function safeJson(text: string) {
  if (!text) return undefined;
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { raw: text };
  }
}

function readProviderError(payload: unknown, text: string) {
  const record = toRecord(payload);
  const error = toRecord(record.error);
  const message = error.message ?? record.message ?? record.error_description ?? record.error;
  if (typeof message === "string" && message.trim()) return message.trim().slice(0, 240);
  return text.replace(/\s+/g, " ").trim().slice(0, 240) || "resposta sem detalhes.";
}

function firstArray(...values: unknown[]) {
  for (const value of values) {
    if (Array.isArray(value)) return value;
  }
  return [];
}

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function stringValue(value: unknown) {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return undefined;
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
