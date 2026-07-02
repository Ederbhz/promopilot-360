import type { WhatsAppProvider } from "@prisma/client";
import { env } from "../config/env.js";
import { decryptJson } from "../lib/crypto.js";
import { prisma } from "../lib/prisma.js";

export interface WhatsAppSendInput {
  groupId: string;
  message: string;
  imageUrl?: string | null;
  scheduledPostId?: string;
}

export async function sendWhatsAppMessage(input: WhatsAppSendInput) {
  const group = await prisma.whatsAppGroup.findUnique({
    where: { id: input.groupId },
    include: { connection: true }
  });
  if (!group) throw new Error("Grupo de WhatsApp nao encontrado.");
  if (!group.isActive || !group.connection.isActive) throw new Error("Grupo ou conexao de WhatsApp inativo.");

  const credentials = safeDecrypt(group.connection.encryptedCredentials);
  const config = toRecord(group.connection.config);
  const messageType = stringValue(config.messageType) ?? "TEXT_IMAGE";

  switch (group.connection.provider) {
    case "CLOUD_API":
      return sendCloudApiGroupMessage({
        groupExternalId: group.externalId,
        phoneNumberId:
          group.connection.phoneNumberId ??
          stringValue(credentials.phoneNumberId) ??
          stringValue(config.phoneNumberId),
        accessToken:
          stringValue(credentials.accessToken) ??
          stringValue(credentials.apiToken) ??
          stringValue(config.accessToken) ??
          stringValue(config.apiToken),
        message: input.message,
        imageUrl: messageType === "TEXT_IMAGE" ? input.imageUrl : undefined,
        previewUrl: config.removePreviewTitle !== true
      });
    case "WASSENGER":
      return sendWassengerGroupMessage({
        groupExternalId: group.externalId,
        token:
          stringValue(credentials.apiToken) ??
          stringValue(credentials.token) ??
          stringValue(config.apiToken) ??
          stringValue(config.token),
        apiBaseUrl: stringValue(config.apiBaseUrl),
        message: input.message
      });
    case "WEBHOOK":
      return sendWebhookMessage({
        webhookUrl: stringValue(config.webhookUrl) ?? stringValue(credentials.webhookUrl),
        token: stringValue(credentials.webhookToken) ?? stringValue(config.webhookToken),
        groupExternalId: group.externalId,
        groupName: group.name,
        message: input.message,
        imageUrl: input.imageUrl,
        scheduledPostId: input.scheduledPostId
      });
    default:
      throw new Error("Conexao WhatsApp em modo assistido. Copie ou abra a mensagem manualmente.");
  }
}

export async function testWhatsAppConnection(connectionId: string) {
  const connection = await prisma.whatsAppConnection.findUnique({ where: { id: connectionId } });
  if (!connection) throw new Error("Conexao WhatsApp nao encontrada.");
  const credentials = safeDecrypt(connection.encryptedCredentials);
  const config = toRecord(connection.config);

  if (connection.provider === "ASSISTED") {
    return { ok: false, mode: "ASSISTED", message: "Conexao em modo assistido." };
  }
  if (connection.provider === "CLOUD_API") {
    const phoneNumberId =
      connection.phoneNumberId ?? stringValue(credentials.phoneNumberId) ?? stringValue(config.phoneNumberId);
    const accessToken =
      stringValue(credentials.accessToken) ??
      stringValue(credentials.apiToken) ??
      stringValue(config.accessToken) ??
      stringValue(config.apiToken);
    return {
      ok: Boolean(phoneNumberId && accessToken),
      mode: "CLOUD_API",
      message: phoneNumberId && accessToken ? "Credenciais Cloud API configuradas." : "Informe Phone Number ID e Access Token."
    };
  }
  if (connection.provider === "WASSENGER") {
    const token =
      stringValue(credentials.apiToken) ??
      stringValue(credentials.token) ??
      stringValue(config.apiToken) ??
      stringValue(config.token);
    return {
      ok: Boolean(token),
      mode: "WASSENGER",
      message: token ? "Token Wassenger configurado." : "Informe API token."
    };
  }

  const webhookUrl = stringValue(config.webhookUrl) ?? stringValue(credentials.webhookUrl);
  return {
    ok: Boolean(webhookUrl),
    mode: "WEBHOOK",
    message: webhookUrl ? "Webhook configurado." : "Informe URL do webhook."
  };
}

async function sendCloudApiGroupMessage(input: {
  groupExternalId: string;
  phoneNumberId?: string;
  accessToken?: string;
  message: string;
  imageUrl?: string | null;
  previewUrl: boolean;
}) {
  if (!input.phoneNumberId || !input.accessToken) {
    throw new Error("WhatsApp Cloud API sem Phone Number ID ou Access Token.");
  }

  const body = input.imageUrl
    ? {
        messaging_product: "whatsapp",
        recipient_type: "group",
        to: input.groupExternalId,
        type: "image",
        image: { link: input.imageUrl, caption: input.message }
      }
    : {
        messaging_product: "whatsapp",
        recipient_type: "group",
        to: input.groupExternalId,
        type: "text",
        text: { body: input.message, preview_url: input.previewUrl }
      };

  const response = await fetch(
    `https://graph.facebook.com/${env.WHATSAPP_GRAPH_VERSION}/${input.phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${input.accessToken}`,
        "content-type": "application/json"
      },
      body: JSON.stringify(body)
    }
  );

  return readProviderResponse(response, "WhatsApp Cloud API");
}

async function sendWassengerGroupMessage(input: {
  groupExternalId: string;
  token?: string;
  apiBaseUrl?: string;
  message: string;
}) {
  if (!input.token) throw new Error("Wassenger sem API token.");
  const response = await fetch(`${input.apiBaseUrl ?? "https://api.wassenger.com"}/v1/messages`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      token: input.token
    },
    body: JSON.stringify({ group: input.groupExternalId, message: input.message })
  });
  return readProviderResponse(response, "Wassenger");
}

async function sendWebhookMessage(input: {
  webhookUrl?: string;
  token?: string;
  groupExternalId: string;
  groupName: string;
  message: string;
  imageUrl?: string | null;
  scheduledPostId?: string;
}) {
  if (!input.webhookUrl) throw new Error("Webhook WhatsApp sem URL.");
  const response = await fetch(input.webhookUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(input.token ? { authorization: `Bearer ${input.token}` } : {})
    },
    body: JSON.stringify({
      groupId: input.groupExternalId,
      groupName: input.groupName,
      message: input.message,
      imageUrl: input.imageUrl,
      scheduledPostId: input.scheduledPostId
    })
  });
  return readProviderResponse(response, "Webhook WhatsApp");
}

async function readProviderResponse(response: Response, provider: string) {
  const text = await response.text();
  const payload = safeJson(text);
  if (!response.ok) {
    throw new Error(`${provider} recusou o envio (${response.status}): ${readProviderError(payload, text)}`);
  }
  return payload ?? { ok: true };
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

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function stringValue(value: unknown) {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return undefined;
}
