import { Router } from "express";
import { z } from "zod";
import { decryptJson, encryptJson } from "../lib/crypto.js";
import { asyncHandler, HttpError } from "../lib/http.js";
import { prisma } from "../lib/prisma.js";
import { jsonInput, sanitizeAffiliateAccount } from "../lib/sanitize.js";
import { getConnectorForAffiliateAccount } from "../services/connectors.js";

const router = Router();

const accountSchema = z.object({
  marketplaceId: z.string().uuid(),
  name: z.string().min(2),
  accountIdentifier: z.string().optional().nullable(),
  affiliateTag: z.string().optional().nullable(),
  credentials: z.record(z.unknown()).optional(),
  config: z.record(z.unknown()).optional(),
  isActive: z.boolean().default(true)
});

const mercadoLivreOAuthUrlSchema = z.object({
  clientId: z.string().trim().min(1),
  redirectUri: z.string().trim().url(),
  state: z.string().trim().optional()
});

const mercadoLivreTokenSchema = z.object({
  clientId: z.string().trim().min(1),
  clientSecret: z.string().trim().min(1),
  redirectUri: z.string().trim().url(),
  code: z.string().trim().min(1),
  codeVerifier: z.string().trim().optional()
});

const mercadoLivreRefreshTokenSchema = z.object({
  clientId: z.string().trim().min(1),
  clientSecret: z.string().trim().min(1),
  refreshToken: z.string().trim().min(1)
});

router.get(
  "/",
  asyncHandler(async (_req, res) => {
    const accounts = await prisma.affiliateAccount.findMany({
      where: { deletedAt: null },
      include: { marketplace: true },
      orderBy: { createdAt: "desc" }
    });
    res.json(accounts.map(sanitizeAffiliateAccount));
  })
);

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const data = accountSchema.parse(req.body);
    const account = await prisma.affiliateAccount.create({
      data: {
        marketplaceId: data.marketplaceId,
        name: data.name,
        accountIdentifier: data.accountIdentifier,
        affiliateTag: data.affiliateTag,
        encryptedCredentials: data.credentials ? jsonInput(encryptJson(data.credentials)) : undefined,
        config: jsonInput(data.config),
        isActive: data.isActive
      },
      include: { marketplace: true }
    });
    res.status(201).json(sanitizeAffiliateAccount(account));
  })
);

router.post(
  "/mercado-livre/oauth-url",
  asyncHandler(async (req, res) => {
    const data = mercadoLivreOAuthUrlSchema.parse(req.body);
    const url = new URL("https://auth.mercadolivre.com.br/authorization");
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", data.clientId);
    url.searchParams.set("redirect_uri", data.redirectUri);
    if (data.state) url.searchParams.set("state", data.state);
    res.json({ url: url.toString() });
  })
);

router.post(
  "/mercado-livre/exchange-token",
  asyncHandler(async (req, res) => {
    const data = mercadoLivreTokenSchema.parse(req.body);
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      client_id: data.clientId,
      client_secret: data.clientSecret,
      code: normalizeAuthorizationCode(data.code),
      redirect_uri: data.redirectUri
    });
    if (data.codeVerifier) body.set("code_verifier", data.codeVerifier);

    const payload = await requestMercadoLivreToken(body);
    res.json(formatMercadoLivreToken(payload));
  })
);

router.post(
  "/mercado-livre/refresh-token",
  asyncHandler(async (req, res) => {
    const data = mercadoLivreRefreshTokenSchema.parse(req.body);
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      client_id: data.clientId,
      client_secret: data.clientSecret,
      refresh_token: data.refreshToken
    });

    const payload = await requestMercadoLivreToken(body);
    res.json(formatMercadoLivreToken(payload));
  })
);

router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const account = await prisma.affiliateAccount.findFirst({
      where: { id: req.params.id, deletedAt: null },
      include: { marketplace: true }
    });
    if (!account) throw new HttpError(404, "Conta de afiliado nao encontrada.");
    res.json(sanitizeAffiliateAccount(account));
  })
);

router.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const data = accountSchema.partial().parse(req.body);
    const before = await prisma.affiliateAccount.findFirst({ where: { id: req.params.id, deletedAt: null } });
    if (!before) throw new HttpError(404, "Conta de afiliado nao encontrada.");
    const mergedCredentials = data.credentials
      ? { ...toRecord(decryptJson<Record<string, unknown>>(before.encryptedCredentials)), ...data.credentials }
      : undefined;
    const mergedConfig = data.config ? { ...toRecord(before.config), ...data.config } : undefined;
    const account = await prisma.affiliateAccount.update({
      where: { id: before.id },
      data: {
        marketplaceId: data.marketplaceId,
        name: data.name,
        accountIdentifier: data.accountIdentifier,
        affiliateTag: data.affiliateTag,
        encryptedCredentials: mergedCredentials ? jsonInput(encryptJson(mergedCredentials)) : undefined,
        config: jsonInput(mergedConfig),
        isActive: data.isActive
      },
      include: { marketplace: true }
    });
    res.json(sanitizeAffiliateAccount(account));
  })
);

router.post(
  "/:id/test",
  asyncHandler(async (req, res) => {
    const account = await prisma.affiliateAccount.findFirst({
      where: { id: req.params.id, deletedAt: null },
      include: { marketplace: true }
    });
    if (!account) throw new HttpError(404, "Conta de afiliado nao encontrada.");
    const connector = getConnectorForAffiliateAccount(account);
    const health = await connector.healthCheck();
    await prisma.integrationLog.create({
      data: {
        marketplaceId: account.marketplaceId,
        operation: "affiliate_account.test",
        status: health.ok ? "SUCCESS" : "WARNING",
        responsePayload: jsonInput(health)
      }
    });
    res.json(health);
  })
);

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const account = await prisma.affiliateAccount.findFirst({ where: { id: req.params.id, deletedAt: null } });
    if (!account) throw new HttpError(404, "Conta de afiliado nao encontrada.");
    await prisma.affiliateAccount.update({
      where: { id: account.id },
      data: { deletedAt: new Date(), isActive: false }
    });
    res.status(204).end();
  })
);

export default router;

async function requestMercadoLivreToken(body: URLSearchParams) {
  const response = await fetch("https://api.mercadolibre.com/oauth/token", {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/x-www-form-urlencoded"
    },
    body
  });
  const text = await response.text();
  const payload = safeJson(text);

  if (!response.ok) {
    throw new HttpError(
      response.status,
      `Mercado Livre recusou a autorizacao (${response.status}): ${extractOAuthError(payload, text)}`
    );
  }

  return payload;
}

function normalizeAuthorizationCode(value: string) {
  const trimmed = value.trim();
  try {
    const url = new URL(trimmed);
    return url.searchParams.get("code") ?? trimmed;
  } catch {
    return trimmed;
  }
}

function safeJson(text: string): Record<string, unknown> {
  if (!text) return {};
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function extractOAuthError(payload: Record<string, unknown>, text: string) {
  const message = payload.message ?? payload.error_description ?? payload.error;
  if (typeof message === "string" && message.trim()) return message.trim();
  return text.replace(/\s+/g, " ").trim().slice(0, 200) || "resposta sem detalhes.";
}

function formatMercadoLivreToken(payload: Record<string, unknown>) {
  return {
    accessToken: stringValue(payload.access_token),
    refreshToken: stringValue(payload.refresh_token),
    expiresIn: numberValue(payload.expires_in),
    tokenType: stringValue(payload.token_type),
    userId: stringValue(payload.user_id)
  };
}

function stringValue(value: unknown) {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return undefined;
}

function numberValue(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}
