import { createConnectorRegistry } from "@promopilot/marketplace-connectors";
import type { ConnectorEnv } from "@promopilot/marketplace-connectors";
import type { MarketplaceKey } from "@prisma/client";
import { env } from "../config/env.js";
import { decryptJson } from "../lib/crypto.js";
import { prisma } from "../lib/prisma.js";

const baseConnectorEnv: ConnectorEnv = {
  AWIN_API_TOKEN: env.AWIN_API_TOKEN,
  AWIN_PUBLISHER_ID: env.AWIN_PUBLISHER_ID,
  AWIN_NATURA_ADVERTISER_ID: env.AWIN_NATURA_ADVERTISER_ID,
  SHOPEE_APP_ID: env.SHOPEE_APP_ID,
  SHOPEE_APP_SECRET: env.SHOPEE_APP_SECRET,
  SHOPEE_AFFILIATE_ID: env.SHOPEE_AFFILIATE_ID,
  SHOPEE_API_BASE_URL: env.SHOPEE_API_BASE_URL,
  SHOPEE_SUB_IDS: env.SHOPEE_SUB_IDS,
  MELI_CLIENT_ID: env.MELI_CLIENT_ID,
  MELI_CLIENT_SECRET: env.MELI_CLIENT_SECRET,
  MELI_ACCESS_TOKEN: env.MELI_ACCESS_TOKEN,
  MELI_REFRESH_TOKEN: env.MELI_REFRESH_TOKEN,
  MELI_AFFILIATE_TAG: env.MELI_AFFILIATE_TAG,
  MELI_AFFILIATE_COOKIE: env.MELI_AFFILIATE_COOKIE,
  MELI_CSRF_TOKEN: env.MELI_CSRF_TOKEN,
  MAGALU_STORE_URL: env.MAGALU_STORE_URL
};

export const connectors = createConnectorRegistry(baseConnectorEnv);

export async function getConnectorForMarketplace(key: MarketplaceKey) {
  const accounts = await prisma.affiliateAccount.findMany({
    where: {
      isActive: true,
      marketplace: { key }
    },
    include: { marketplace: true },
    orderBy: { updatedAt: "asc" }
  });

  if (!accounts.length) return connectors[key] ?? connectors.MANUAL;

  const envForMarketplace = accounts.reduce<ConnectorEnv>(
    (current, account) => ({ ...current, ...accountToConnectorEnv(account) }),
    baseConnectorEnv
  );
  return createConnectorRegistry(envForMarketplace)[key] ?? connectors.MANUAL;
}

export function getConnectorForAffiliateAccount(account: {
  marketplace: { key: MarketplaceKey };
  accountIdentifier?: string | null;
  affiliateTag?: string | null;
  encryptedCredentials?: unknown;
  config?: unknown;
}) {
  const accountEnv = accountToConnectorEnv(account);
  return createConnectorRegistry({ ...baseConnectorEnv, ...accountEnv })[account.marketplace.key] ?? connectors.MANUAL;
}

export async function getMarketplaceHealth(key: MarketplaceKey) {
  const connector = await getConnectorForMarketplace(key);
  return connector.healthCheck();
}

function accountToConnectorEnv(account: {
  marketplace: { key: MarketplaceKey };
  accountIdentifier?: string | null;
  affiliateTag?: string | null;
  encryptedCredentials?: unknown;
  config?: unknown;
}): ConnectorEnv {
  const credentials = safeDecrypt(account.encryptedCredentials);
  const config = toRecord(account.config);

  switch (account.marketplace.key) {
    case "AWIN":
      return compactEnv({
        AWIN_API_TOKEN: pick(credentials, "apiToken", "token", "AWIN_API_TOKEN"),
        AWIN_PUBLISHER_ID:
          account.affiliateTag ??
          account.accountIdentifier ??
          pick(credentials, "publisherId", "affiliateId", "AWIN_PUBLISHER_ID") ??
          pick(config, "publisherId", "affiliateId", "AWIN_PUBLISHER_ID"),
        AWIN_NATURA_ADVERTISER_ID:
          pick(credentials, "advertiserId", "naturaAdvertiserId", "AWIN_NATURA_ADVERTISER_ID") ??
          pick(config, "advertiserId", "naturaAdvertiserId", "AWIN_NATURA_ADVERTISER_ID")
      });
    case "SHOPEE":
      return compactEnv({
        SHOPEE_APP_ID:
          account.accountIdentifier ??
          pick(credentials, "appId", "app_id", "clientId", "SHOPEE_APP_ID") ??
          pick(config, "appId", "app_id", "clientId", "SHOPEE_APP_ID"),
        SHOPEE_APP_SECRET:
          pick(credentials, "appSecret", "app_secret", "secret", "SHOPEE_APP_SECRET") ??
          pick(config, "appSecret", "app_secret", "secret", "SHOPEE_APP_SECRET"),
        SHOPEE_AFFILIATE_ID:
          account.affiliateTag ??
          pick(credentials, "affiliateId", "publisherId", "tag", "SHOPEE_AFFILIATE_ID") ??
          pick(config, "affiliateId", "publisherId", "tag", "SHOPEE_AFFILIATE_ID"),
        SHOPEE_API_BASE_URL:
          pick(credentials, "apiBaseUrl", "baseUrl", "SHOPEE_API_BASE_URL") ??
          pick(config, "apiBaseUrl", "baseUrl", "SHOPEE_API_BASE_URL"),
        SHOPEE_SUB_IDS:
          pick(credentials, "subIds", "sub_ids", "SHOPEE_SUB_IDS") ??
          pick(config, "subIds", "sub_ids", "SHOPEE_SUB_IDS")
      });
    case "MERCADO_LIVRE":
      return compactEnv({
        MELI_CLIENT_ID:
          account.accountIdentifier ??
          pick(credentials, "clientId", "appId", "MELI_CLIENT_ID") ??
          pick(config, "clientId", "appId", "MELI_CLIENT_ID"),
        MELI_CLIENT_SECRET:
          pick(credentials, "clientSecret", "appSecret", "MELI_CLIENT_SECRET") ??
          pick(config, "clientSecret", "appSecret", "MELI_CLIENT_SECRET"),
        MELI_ACCESS_TOKEN:
          pick(credentials, "accessToken", "token", "MELI_ACCESS_TOKEN") ??
          pick(config, "accessToken", "token", "MELI_ACCESS_TOKEN"),
        MELI_REFRESH_TOKEN:
          pick(credentials, "refreshToken", "refresh_token", "MELI_REFRESH_TOKEN") ??
          pick(config, "refreshToken", "refresh_token", "MELI_REFRESH_TOKEN"),
        MELI_AFFILIATE_TAG:
          account.affiliateTag ??
          pick(credentials, "affiliateTag", "tag", "mattTool", "MELI_AFFILIATE_TAG") ??
          pick(config, "affiliateTag", "tag", "mattTool", "MELI_AFFILIATE_TAG"),
        MELI_AFFILIATE_COOKIE:
          pick(credentials, "affiliateCookie", "cookie", "MELI_AFFILIATE_COOKIE") ??
          pick(config, "affiliateCookie", "cookie", "MELI_AFFILIATE_COOKIE"),
        MELI_CSRF_TOKEN:
          pick(credentials, "csrfToken", "xCsrfToken", "x-csrf-token", "MELI_CSRF_TOKEN") ??
          pick(config, "csrfToken", "xCsrfToken", "x-csrf-token", "MELI_CSRF_TOKEN")
      });
    case "MAGALU":
      return compactEnv({
        MAGALU_STORE_URL:
          account.accountIdentifier ??
          account.affiliateTag ??
          pick(credentials, "storeUrl", "partnerUrl", "MAGALU_STORE_URL") ??
          pick(config, "storeUrl", "partnerUrl", "MAGALU_STORE_URL")
      });
    default:
      return {};
  }
}

function compactEnv(value: ConnectorEnv): ConnectorEnv {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => typeof entry === "string" && entry.trim().length > 0)
  ) as ConnectorEnv;
}

function safeDecrypt(payload: unknown): Record<string, unknown> {
  try {
    return toRecord(decryptJson<Record<string, unknown>>(payload));
  } catch {
    return {};
  }
}

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function pick(record: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return undefined;
}
