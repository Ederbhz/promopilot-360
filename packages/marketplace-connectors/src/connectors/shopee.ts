import {
  calculateOfferScore,
  type AffiliateLinkResult,
  type ConnectorHealthResult,
  type GenerateAffiliateLinkParams,
  type MarketplaceConnector,
  type OfferCandidate,
  type ProductExtractionResult,
  type SearchOffersParams
} from "@promopilot/shared";
import { createHash } from "node:crypto";
import { extractPublicMetadata } from "../extract.js";
import type { ConnectorEnv } from "../registry.js";

export class ShopeeConnector implements MarketplaceConnector {
  marketplaceKey = "SHOPEE";

  constructor(private readonly env: ConnectorEnv) {}

  async searchOffers(params: SearchOffersParams): Promise<OfferCandidate[]> {
    if (!this.hasOpenApiCredentials()) {
      throw new Error(
        "Shopee em modo assistido. Configure App ID e App Secret da Affiliate Open API para buscar ofertas automaticamente."
      );
    }

    const keyword = [params.category, params.keyword].filter(Boolean).join(" ").trim();
    const limit = Math.min(params.limit ?? 20, 50);
    const query = `{
      productOfferV2(
        ${keyword ? `keyword: ${gqlString(keyword)}` : ""}
        listType: ${params.sortBy === "commission" ? 1 : 0}
        sortType: ${toShopeeSortType(params.sortBy)}
        page: 1
        limit: ${limit}
      ) {
        nodes {
          itemId
          productName
          productLink
          offerLink
          imageUrl
          priceMin
          priceMax
          priceDiscountRate
          sales
          ratingStar
          commissionRate
          sellerCommissionRate
          shopeeCommissionRate
          commission
          shopId
          shopName
        }
      }
    }`;

    const payload = await this.callAffiliateApi<ShopeeProductOfferResponse>({ query });
    const products = payload.data?.productOfferV2?.nodes ?? [];
    const candidates = products.map((item) => this.toOfferCandidate(item, params.category));
    return sortCandidates(applyOfferFilters(candidates, params), params.sortBy).slice(0, limit);
  }

  async extractFromUrl(url: string): Promise<ProductExtractionResult> {
    const result = await extractPublicMetadata(url);
    return { ...result, marketplaceKey: "SHOPEE" };
  }

  async generateAffiliateLink(params: GenerateAffiliateLinkParams): Promise<AffiliateLinkResult> {
    if (!this.hasOpenApiCredentials()) {
      return {
        requiresManualInput: true,
        provider: "shopee",
        message: "Configure App ID e App Secret da Shopee Affiliate Open API ou informe o link final manualmente."
      };
    }

    try {
      const affiliateUrl = await this.createShortAffiliateLink(params.destinationUrl);
      return {
        affiliateUrl,
        requiresManualInput: false,
        provider: "shopee",
        metadata: {
          rule: "generateShortLink",
          destinationUrl: params.destinationUrl,
          subIds: this.getSubIds()
        }
      };
    } catch (error) {
      return {
        requiresManualInput: true,
        provider: "shopee",
        message: error instanceof Error ? error.message : "Shopee nao gerou o link curto."
      };
    }
  }

  async healthCheck(): Promise<ConnectorHealthResult> {
    const configured = this.hasOpenApiCredentials();
    return {
      ok: configured,
      mode: configured ? "API" : "ASSISTED",
      message: configured
        ? "Shopee configurada para gerar links e buscar ofertas pela Affiliate Open API."
        : "Shopee em modo manual/assistido. Configure App ID e App Secret da Open API."
    };
  }

  private hasOpenApiCredentials() {
    return Boolean(this.env.SHOPEE_APP_ID?.trim() && this.env.SHOPEE_APP_SECRET?.trim());
  }

  private async createShortAffiliateLink(originUrl: string) {
    const subIds = this.getSubIds();
    const query = `mutation {
      generateShortLink(
        input: {
          originUrl: ${gqlString(originUrl)}
          ${subIds.length ? `subIds: [${subIds.map(gqlString).join(", ")}]` : ""}
        }
      ) {
        shortLink
      }
    }`;
    const payload = await this.callAffiliateApi<ShopeeGenerateShortLinkResponse>({ query });
    const shortLink = payload.data?.generateShortLink?.shortLink;
    if (!shortLink) {
      throw new Error("Shopee respondeu sem shortLink. Verifique se a URL pertence a shopee.com.br e tente novamente.");
    }
    return shortLink;
  }

  private async callAffiliateApi<T>(body: { query: string }) {
    const endpoint = this.getApiEndpoint();
    const payload = JSON.stringify(body);
    const timestamp = String(Math.floor(Date.now() / 1000));
    const appId = this.env.SHOPEE_APP_ID?.trim() ?? "";
    const secret = this.env.SHOPEE_APP_SECRET?.trim() ?? "";
    const signature = createHash("sha256").update(`${appId}${timestamp}${payload}${secret}`).digest("hex");

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: `SHA256 Credential=${appId}, Timestamp=${timestamp}, Signature=${signature}`,
        "content-type": "application/json",
        "user-agent": "PromoPilot360/0.1"
      },
      body: payload
    });
    const text = await response.text();
    const json = safeJson(text) as ShopeeGraphQlResponse<T>;

    if (!response.ok || json.errors?.length) {
      throw new Error(formatShopeeError(response.status, json.errors, text));
    }

    return json as ShopeeGraphQlResponse<T>;
  }

  private getApiEndpoint() {
    const configured = this.env.SHOPEE_API_BASE_URL?.trim();
    if (!configured) return "https://open-api.affiliate.shopee.com.br/graphql";
    return configured.endsWith("/graphql") ? configured : `${configured.replace(/\/$/, "")}/graphql`;
  }

  private getSubIds() {
    return (this.env.SHOPEE_SUB_IDS ?? "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 5);
  }

  private toOfferCandidate(item: ShopeeProductOfferItem, preferredCategory?: string): OfferCandidate {
    const currentPrice = normalizeShopeeMoney(item.priceMin);
    const oldPrice = undefined;
    const discountPercent = toNumber(item.priceDiscountRate);
    const commissionPercent = normalizeCommissionRate(item.commissionRate);
    const candidate: OfferCandidate = {
      marketplaceKey: "SHOPEE",
      externalId: item.itemId ? String(item.itemId) : undefined,
      title: item.productName || "Oferta Shopee",
      productUrl: item.productLink,
      affiliateUrl: item.offerLink,
      currentPrice,
      oldPrice,
      discountPercent,
      imageUrl: item.imageUrl,
      rating: toNumber(item.ratingStar),
      reviewCount: toNumber(item.sales),
      estimatedCommission: normalizeShopeeMoney(item.commission),
      commissionPercent,
      category: preferredCategory,
      brand: item.shopName,
      metadata: {
        source: "shopee-affiliate-open-api",
        shopId: item.shopId,
        shopName: item.shopName,
        priceMax: normalizeShopeeMoney(item.priceMax),
        sellerCommissionRate: normalizeCommissionRate(item.sellerCommissionRate),
        shopeeCommissionRate: normalizeCommissionRate(item.shopeeCommissionRate)
      }
    };
    return { ...candidate, score: calculateOfferScore(candidate) };
  }
}

interface ShopeeGraphQlResponse<T> {
  data?: T extends { data?: infer D } ? D : never;
  errors?: ShopeeGraphQlError[];
}

interface ShopeeGraphQlError {
  message?: string;
  extensions?: {
    code?: number | string;
    message?: string;
  };
}

interface ShopeeGenerateShortLinkResponse {
  data?: {
    generateShortLink?: {
      shortLink?: string;
    };
  };
}

interface ShopeeProductOfferResponse {
  data?: {
    productOfferV2?: {
      nodes?: ShopeeProductOfferItem[];
    };
  };
}

interface ShopeeProductOfferItem {
  itemId?: string | number;
  productName?: string;
  productLink: string;
  offerLink?: string;
  imageUrl?: string;
  priceMin?: string | number;
  priceMax?: string | number;
  priceDiscountRate?: string | number;
  sales?: string | number;
  ratingStar?: string | number;
  commissionRate?: string | number;
  sellerCommissionRate?: string | number;
  shopeeCommissionRate?: string | number;
  commission?: string | number;
  shopId?: string | number;
  shopName?: string;
}

function safeJson(text: string) {
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return {};
  }
}

function formatShopeeError(status: number, errors: ShopeeGraphQlError[] | undefined, text: string) {
  const error = errors?.[0];
  const code = error?.extensions?.code;
  const message = error?.extensions?.message || error?.message;
  const detail = message || text.replace(/\s+/g, " ").trim().slice(0, 180);
  const prefix = status >= 400 ? `Shopee respondeu ${status}` : "Shopee recusou a chamada";
  const suffix = code ? ` Codigo: ${code}.` : "";
  return `${prefix}.${suffix}${detail ? ` Detalhe: ${detail}` : ""}`;
}

function gqlString(value: string) {
  return JSON.stringify(value);
}

function toShopeeSortType(sortBy: SearchOffersParams["sortBy"]) {
  if (sortBy === "price") return 4;
  if (sortBy === "commission") return 5;
  if (sortBy === "rating") return 1;
  return 2;
}

function applyOfferFilters(candidates: OfferCandidate[], params: SearchOffersParams) {
  return candidates.filter((candidate) => {
    if (params.minPrice !== undefined && (candidate.currentPrice ?? 0) < params.minPrice) return false;
    if (params.maxPrice !== undefined && (candidate.currentPrice ?? 0) > params.maxPrice) return false;
    if (params.minDiscount !== undefined && (candidate.discountPercent ?? 0) < params.minDiscount) return false;
    if (params.freeShipping !== undefined && Boolean(candidate.freeShipping) !== params.freeShipping) return false;
    if (params.minRating !== undefined && (candidate.rating ?? 0) < params.minRating) return false;
    if (params.hasCoupon !== undefined && Boolean(candidate.couponCode) !== params.hasCoupon) return false;
    if (params.minCommission !== undefined && (candidate.commissionPercent ?? 0) < params.minCommission) return false;
    return true;
  });
}

function sortCandidates(candidates: OfferCandidate[], sortBy: SearchOffersParams["sortBy"]) {
  return [...candidates].sort((a, b) => {
    switch (sortBy) {
      case "discount":
        return (b.discountPercent ?? 0) - (a.discountPercent ?? 0);
      case "rating":
        return (b.rating ?? 0) - (a.rating ?? 0);
      case "price":
        return (a.currentPrice ?? Number.MAX_SAFE_INTEGER) - (b.currentPrice ?? Number.MAX_SAFE_INTEGER);
      case "commission":
        return (b.commissionPercent ?? 0) - (a.commissionPercent ?? 0);
      default:
        return (b.score ?? 0) - (a.score ?? 0);
    }
  });
}

function normalizeShopeeMoney(value: unknown) {
  const parsed = toNumber(value);
  if (parsed === undefined) return undefined;
  return parsed > 100000 ? parsed / 100000 : parsed;
}

function normalizeCommissionRate(value: unknown) {
  const parsed = toNumber(value);
  if (parsed === undefined) return undefined;
  return parsed <= 1 ? parsed * 100 : parsed;
}

function toNumber(value: unknown): number | undefined {
  if (value === null || value === undefined) return undefined;
  const parsed = Number(String(value).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : undefined;
}
