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
import * as cheerio from "cheerio";
import { extractPublicMetadata } from "../extract.js";
import type { ConnectorEnv } from "../registry.js";

export class MercadoLivreConnector implements MarketplaceConnector {
  marketplaceKey = "MERCADO_LIVRE";

  constructor(private readonly env: ConnectorEnv) {}

  async searchOffers(params: SearchOffersParams): Promise<OfferCandidate[]> {
    const keyword = params.keyword || params.category || "ofertas";
    const limit = Math.min(params.limit ?? 20, 50);

    let apiError: Error | undefined;
    if (this.env.MELI_ACCESS_TOKEN) {
      try {
        return await this.searchApiOffers(params, keyword, limit);
      } catch (error) {
        apiError = error instanceof Error ? error : new Error("Falha desconhecida na API do Mercado Livre.");
      }
    }

    const publicOffers = await this.searchPublicOffers(params, keyword, limit, apiError?.message);
    if (publicOffers.length) return publicOffers;

    if (apiError) {
      throw new Error(
        `${apiError.message} A vitrine publica de ofertas foi consultada como fallback, mas nao retornou cards compativeis com os filtros.`
      );
    }

    throw new Error("Mercado Livre nao retornou ofertas na vitrine publica. Tente reduzir filtros ou importar por link.");
  }

  private async searchApiOffers(params: SearchOffersParams, keyword: string, limit: number) {
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
    const candidates = applyOfferFilters(
      payload.results.map((item) => this.toOfferCandidate(item)),
      params,
      keyword
    );

    return sortCandidates(candidates, params.sortBy).slice(0, limit);
  }

  private async searchPublicOffers(params: SearchOffersParams, keyword: string, limit: number, fallbackReason?: string) {
    const offersUrl = new URL("https://www.mercadolivre.com.br/ofertas");
    offersUrl.searchParams.set("limit", String(limit));

    const response = await fetch(offersUrl, {
      headers: {
        accept: "text/html,application/xhtml+xml",
        "accept-language": "pt-BR,pt;q=0.9,en;q=0.7",
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36"
      }
    });

    if (!response.ok) {
      const details = await readErrorDetails(response);
      const suffix = details ? ` Detalhe: ${details}` : "";
      throw new Error(`Mercado Livre respondeu ${response.status} ao consultar a vitrine publica de ofertas.${suffix}`);
    }

    const html = await response.text();
    const $ = cheerio.load(html);
    const candidates: OfferCandidate[] = [];

    $(".poly-card").each((_index, element) => {
      const card = $(element);
      const link = card.find(".poly-component__title").first();
      const rawProductUrl = link.attr("href") ?? card.find("a[href]").first().attr("href");
      const image = card.find("img").first();
      const title = cleanText(link.text()) || cleanText(image.attr("alt")) || "Oferta Mercado Livre";
      const productUrl = normalizeProductUrl(rawProductUrl);
      if (!productUrl) return;

      const currentPrice = parseMoneyAmount(card.find(".poly-price__current .poly-price__amount").first());
      const oldPrice = parseMoneyAmount(card.find(".poly-price__previous").first());
      const discountPercent = parseDiscount(
        card.find(".poly-price__disc-label, .andes-money-amount__discount").first().text()
      );
      const rating = parseDecimal(card.find(".poly-reviews__rating").first().text());
      const reviewCount = parseInteger(card.find(".poly-reviews__total").first().text());
      const seller = cleanText(card.find(".poly-component__seller").first().text()).replace(/^Por\s+/i, "");
      const freeShipping = /gr[aá]tis|frete gr[aá]tis/i.test(card.text());

      const candidate: OfferCandidate = {
        marketplaceKey: "MERCADO_LIVRE",
        externalId: extractMercadoLivreId(rawProductUrl),
        title,
        productUrl,
        affiliateUrl: this.env.MELI_AFFILIATE_TAG ? this.buildAffiliateUrl(productUrl) : undefined,
        currentPrice,
        oldPrice,
        discountPercent:
          discountPercent ??
          (oldPrice && currentPrice && oldPrice > currentPrice
            ? Math.round(((oldPrice - currentPrice) / oldPrice) * 100)
            : undefined),
        imageUrl: normalizeImageUrl(image.attr("src") ?? image.attr("data-src")),
        freeShipping,
        rating,
        reviewCount,
        brand: seller || undefined,
        category: params.category,
        metadata: {
          source: "mercado-livre-public-offers",
          sourceUrl: offersUrl.toString(),
          apiFallbackReason: fallbackReason
        }
      };
      candidates.push({ ...candidate, score: calculateOfferScore(candidate) });
    });

    return sortCandidates(applyOfferFilters(candidates, params, keyword), params.sortBy).slice(0, limit);
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
      ok: true,
      mode: this.env.MELI_ACCESS_TOKEN ? "API" : "ASSISTED",
      message: this.env.MELI_ACCESS_TOKEN
        ? "Mercado Livre configurado com token de API. Se a API negar busca, a vitrine publica sera usada como fallback."
        : this.env.MELI_AFFILIATE_TAG
        ? "Tag configurada para links. Garimpo usa vitrine publica quando a API nao estiver disponivel."
        : "Mercado Livre em modo assistido com garimpo pela vitrine publica de ofertas."
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

function parseMoneyAmount(node: cheerio.Cheerio<any>): number | undefined {
  const fraction = cleanText(node.find("[data-andes-money-amount-fraction]").first().text());
  if (!fraction) return undefined;
  const cents = cleanText(node.find("[data-andes-money-amount-cents]").first().text());
  return parseBrazilianNumber(cents ? `${fraction},${cents}` : fraction);
}

function parseBrazilianNumber(value: string): number | undefined {
  const normalized = cleanText(value).replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseDecimal(value: string): number | undefined {
  const normalized = cleanText(value).replace(/[^\d,.-]/g, "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseInteger(value: string): number | undefined {
  const parsed = Number(cleanText(value).replace(/\D/g, ""));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseDiscount(value: string): number | undefined {
  const match = cleanText(value).match(/(\d{1,3})\s*%\s*OFF/i);
  return match?.[1] ? Number(match[1]) : undefined;
}

function normalizeImageUrl(value?: string) {
  if (!value) return undefined;
  return value.startsWith("http://") ? value.replace("http://", "https://") : value;
}

function normalizeProductUrl(value?: string) {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    const normalized = new URL(`${url.origin}${url.pathname}`);
    const dealFilter = url.searchParams.get("pdp_filters");
    if (dealFilter) normalized.searchParams.set("pdp_filters", dealFilter);
    return normalized.toString();
  } catch {
    return value;
  }
}

function extractMercadoLivreId(value?: string) {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    const itemId = url.searchParams.get("wid");
    if (itemId) return itemId;
    return url.pathname.match(/\/p\/(MLB\d+)/i)?.[1];
  } catch {
    return value.match(/MLB\d+/i)?.[0];
  }
}

function cleanText(value?: string) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function normalizeSearchText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function applyOfferFilters(candidates: OfferCandidate[], params: SearchOffersParams, keyword: string) {
  const keywordWords = normalizeSearchText(keyword)
    .split(/\s+/)
    .map((word) => word.trim())
    .filter((word) => word.length > 2 && !["oferta", "ofertas", "promocao", "promocoes"].includes(word));

  return candidates.filter((candidate) => {
    if (keywordWords.length) {
      const haystack = normalizeSearchText(
        [candidate.title, candidate.brand, candidate.category].filter(Boolean).join(" ")
      );
      if (!keywordWords.every((word) => haystack.includes(word))) return false;
    }
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
