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
import { extractPublicMetadata } from "../extract.js";
import type { ConnectorEnv } from "../registry.js";

export class MercadoLivreConnector implements MarketplaceConnector {
  marketplaceKey = "MERCADO_LIVRE";

  constructor(private readonly env: ConnectorEnv) {}

  async searchOffers(params: SearchOffersParams): Promise<OfferCandidate[]> {
    if (!this.env.MELI_ACCESS_TOKEN) {
      throw new Error(
        "Mercado Livre exige Access Token OAuth para garimpo automatico. Gere o token em Configuracoes ou importe pelo link do produto."
      );
    }

    const keyword = params.keyword || params.category || "ofertas";
    const limit = Math.min(params.limit ?? 20, 50);
    const searchUrl = new URL("https://api.mercadolibre.com/sites/MLB/search");
    searchUrl.searchParams.set("q", keyword);
    searchUrl.searchParams.set("limit", String(limit));
    searchUrl.searchParams.set("sort", params.sortBy === "price" ? "price_asc" : "relevance");

    const response = await fetch(searchUrl, {
      headers: {
        accept: "application/json",
        ...(this.env.MELI_ACCESS_TOKEN ? { authorization: `Bearer ${this.env.MELI_ACCESS_TOKEN}` } : {}),
        "user-agent": "PromoPilot360/0.1"
      }
    });
    if (!response.ok) {
      const details = await readErrorDetails(response);
      const suffix = details ? ` Detalhe: ${details}` : "";
      if (response.status === 401 || response.status === 403) {
        throw new Error(
          `Mercado Livre respondeu ${response.status} ao buscar ofertas. Verifique se o Access Token OAuth esta ativo e pertence ao app autorizado; login no navegador nao autoriza o Render.${suffix}`
        );
      }
      throw new Error(`Mercado Livre respondeu ${response.status} ao buscar ofertas.${suffix}`);
    }

    const payload = (await response.json()) as MercadoLivreSearchResponse;
    const candidates = payload.results.map((item) => this.toOfferCandidate(item)).filter((candidate) => {
      if (params.minPrice !== undefined && (candidate.currentPrice ?? 0) < params.minPrice) return false;
      if (params.maxPrice !== undefined && (candidate.currentPrice ?? 0) > params.maxPrice) return false;
      if (params.minDiscount !== undefined && (candidate.discountPercent ?? 0) < params.minDiscount) return false;
      if (params.freeShipping !== undefined && Boolean(candidate.freeShipping) !== params.freeShipping) return false;
      return true;
    });

    return sortCandidates(candidates, params.sortBy).slice(0, limit);
  }

  async extractFromUrl(url: string): Promise<ProductExtractionResult> {
    const result = await extractPublicMetadata(url);
    return { ...result, marketplaceKey: "MERCADO_LIVRE" };
  }

  async generateAffiliateLink(params: GenerateAffiliateLinkParams): Promise<AffiliateLinkResult> {
    if (this.env.MELI_AFFILIATE_TAG) {
      return {
        affiliateUrl: this.buildAffiliateUrl(params.destinationUrl),
        requiresManualInput: false,
        provider: "mercado-livre",
        metadata: { rule: "query-param-tag" }
      };
    }

    return {
      requiresManualInput: true,
      provider: "mercado-livre",
      message: "Mercado Livre esta no modo assistido. Cole o link gerado no Portal do Afiliado."
    };
  }

  async healthCheck(): Promise<ConnectorHealthResult> {
    return {
      ok: Boolean(this.env.MELI_ACCESS_TOKEN || this.env.MELI_AFFILIATE_TAG),
      mode: this.env.MELI_ACCESS_TOKEN ? "API" : this.env.MELI_AFFILIATE_TAG ? "ASSISTED" : "MANUAL",
      message: this.env.MELI_ACCESS_TOKEN
        ? "Mercado Livre configurado com token de API."
        : this.env.MELI_AFFILIATE_TAG
        ? "Tag configurada para links. Garimpo automatico precisa de Access Token OAuth."
        : "Mercado Livre precisa de Access Token OAuth para garimpo automatico."
    };
  }

  private toOfferCandidate(item: MercadoLivreSearchItem): OfferCandidate {
    const currentPrice = toNumber(item.price);
    const oldPrice = toNumber(item.original_price);
    const discountPercent =
      oldPrice && currentPrice && oldPrice > currentPrice
        ? Math.round(((oldPrice - currentPrice) / oldPrice) * 100)
        : undefined;
    const candidate: OfferCandidate = {
      marketplaceKey: "MERCADO_LIVRE",
      externalId: item.id,
      title: item.title || "Oferta Mercado Livre",
      productUrl: item.permalink,
      affiliateUrl: this.env.MELI_AFFILIATE_TAG ? this.buildAffiliateUrl(item.permalink) : undefined,
      currentPrice,
      oldPrice,
      discountPercent,
      imageUrl: normalizeImageUrl(item.thumbnail),
      freeShipping: item.shipping?.free_shipping,
      reviewCount: item.sold_quantity,
      category: item.domain_id,
      brand: item.attributes?.find((attribute) => attribute.id === "BRAND")?.value_name,
      metadata: {
        source: "mercado-livre-public-search",
        condition: item.condition,
        seller: item.seller?.nickname,
        catalogProductId: item.catalog_product_id
      }
    };
    return {
      ...candidate,
      score: calculateOfferScore(candidate)
    };
  }

  private buildAffiliateUrl(destinationUrl: string) {
    const url = new URL(destinationUrl);
    url.searchParams.set("matt_tool", this.env.MELI_AFFILIATE_TAG ?? "");
    return url.toString();
  }
}

async function readErrorDetails(response: Response) {
  const text = await response.text().catch(() => "");
  if (!text) return "";

  try {
    const payload = JSON.parse(text) as Record<string, unknown>;
    const message = payload.message ?? payload.error_description ?? payload.error;
    return typeof message === "string" ? message.slice(0, 180) : "";
  } catch {
    return text.replace(/\s+/g, " ").slice(0, 180);
  }
}

interface MercadoLivreSearchResponse {
  results: MercadoLivreSearchItem[];
}

interface MercadoLivreSearchItem {
  id: string;
  title: string;
  permalink: string;
  price?: number;
  original_price?: number | null;
  thumbnail?: string;
  condition?: string;
  domain_id?: string;
  catalog_product_id?: string | null;
  sold_quantity?: number;
  shipping?: { free_shipping?: boolean };
  seller?: { nickname?: string };
  attributes?: Array<{ id?: string; value_name?: string }>;
}

function toNumber(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function normalizeImageUrl(value?: string) {
  if (!value) return undefined;
  return value.startsWith("http://") ? value.replace("http://", "https://") : value;
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
