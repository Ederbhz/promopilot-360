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
    const primaryKeyword = [params.category, params.keyword].filter(Boolean).join(" ") || "ofertas";
    const requestedLimit = Math.min(params.limit ?? 20, 100);
    const hasQueryParams = Boolean(params.keyword || params.category);

    let apiError: Error | undefined;
    if (this.env.MELI_ACCESS_TOKEN || hasQueryParams) {
      try {
        return await this.searchApiOffers(params, requestedLimit);
      } catch (error) {
        apiError = error instanceof Error ? error : new Error("Falha desconhecida na API do Mercado Livre.");
      }
    }

    const publicOffers = await this.searchPublicOffers(params, primaryKeyword, requestedLimit, apiError?.message);
    if (publicOffers.length) return publicOffers;

    if (hasQueryParams) {
      return [];
    }

    if (apiError) {
      throw new Error(
        `${apiError.message} A vitrine publica de ofertas foi consultada como fallback, mas nao retornou cards compativeis com os filtros.`
      );
    }

    throw new Error("Mercado Livre nao retornou ofertas na vitrine publica. Tente reduzir filtros ou importar por link.");
  }

  private async searchApiOffers(params: SearchOffersParams, requestedLimit: number) {
    const collected = new Map<string, OfferCandidate>();
    const queries = buildSearchQueries(params);
    const pageLimit = Math.min(50, Math.max(requestedLimit, 20));
    const maxPagesPerQuery = Math.max(2, Math.ceil((requestedLimit * 3) / pageLimit));

    for (const query of queries) {
      let offset = 0;
      for (let page = 0; page < maxPagesPerQuery && collected.size < requestedLimit; page += 1) {
        const payload = await this.fetchSearchPage(query, pageLimit, offset, params.sortBy);
        const pageCandidates = applyOfferFilters(
          payload.results.map((item) => this.toOfferCandidate(item, params.category)),
          params
        );

        for (const candidate of pageCandidates) {
          collected.set(candidate.externalId ?? candidate.productUrl, candidate);
          if (collected.size >= requestedLimit) break;
        }

        const received = payload.results.length;
        const total = payload.paging?.total ?? 0;
        if (received < pageLimit || offset + pageLimit >= total) break;
        offset += pageLimit;
      }

      if (collected.size >= requestedLimit) break;
    }

    return sortCandidates([...collected.values()], params.sortBy).slice(0, requestedLimit);
  }

  private async fetchSearchPage(
    keyword: string,
    limit: number,
    offset: number,
    sortBy: SearchOffersParams["sortBy"]
  ) {
    const searchUrl = new URL("https://api.mercadolibre.com/sites/MLB/search");
    searchUrl.searchParams.set("q", keyword);
    searchUrl.searchParams.set("limit", String(limit));
    searchUrl.searchParams.set("offset", String(offset));
    searchUrl.searchParams.set("sort", sortBy === "price" ? "price_asc" : "relevance");

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

    return (await response.json()) as MercadoLivreSearchResponse;
  }

  private async searchPublicOffers(params: SearchOffersParams, keyword: string, limit: number, fallbackReason?: string) {
    const baseOffersUrl = new URL("https://www.mercadolivre.com.br/ofertas");
    const fallbackLimit = params.keyword || params.category ? Math.min(100, Math.max(limit * 5, 50)) : limit;
    baseOffersUrl.searchParams.set("limit", String(fallbackLimit));
    const offersUrls: URL[] = [];
    if (params.keyword || params.category) {
      baseOffersUrl.searchParams.set("search", keyword);
      const categoryId = await this.findPublicSearchCategoryId(keyword);
      if (categoryId) {
        const categorizedUrl = new URL(baseOffersUrl);
        categorizedUrl.searchParams.set("category", categoryId);
        offersUrls.push(categorizedUrl);
      }
    }
    offersUrls.push(baseOffersUrl);

    const candidates: OfferCandidate[] = [];
    let lastPublicError: Error | undefined;

    for (const offersUrl of offersUrls) {
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
      lastPublicError = new Error(`Mercado Livre respondeu ${response.status} ao consultar a vitrine publica de ofertas.${suffix}`);
      continue;
    }

    const html = await response.text();
    const $ = cheerio.load(html);

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
        affiliateUrl: undefined,
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
        category: inferCategoryFromText([title, seller].filter(Boolean).join(" "), params.category),
        metadata: {
          source: "mercado-livre-public-offers",
          requestedKeyword: keyword,
          sourceUrl: offersUrl.toString(),
          apiFallbackReason: fallbackReason
        }
      };
      candidates.push({ ...candidate, score: calculateOfferScore(candidate) });
    });
    }

    if (!candidates.length && lastPublicError) throw lastPublicError;

    const strictMatches = sortCandidates(applyOfferFilters(candidates, params), params.sortBy);
    if (strictMatches.length >= limit) return strictMatches.slice(0, limit);

    const broadMatches = rankPublicCandidates(applyBasicOfferFilters(candidates, params), params);
    return mergeCandidates(strictMatches, broadMatches).slice(0, limit);
  }

  async extractFromUrl(url: string): Promise<ProductExtractionResult> {
    const result = await extractPublicMetadata(url);
    return { ...result, marketplaceKey: "MERCADO_LIVRE" };
  }

  async generateAffiliateLink(params: GenerateAffiliateLinkParams): Promise<AffiliateLinkResult> {
    const tag = this.env.MELI_AFFILIATE_TAG?.trim();
    if (!tag) {
      return {
        provider: "mercado-livre",
        requiresManualInput: true,
        message:
          "Nao encontrei a Tag de afiliado do Mercado Livre. Salve a tag em Configuracoes ou cole o link final no card da oferta."
      };
    }

    if (!this.env.MELI_AFFILIATE_COOKIE || !this.env.MELI_CSRF_TOKEN) {
      return {
        provider: "mercado-livre",
        requiresManualInput: true,
        message:
          "Para gerar link meli.la automaticamente, salve Cookie e X-CSRF-Token do Portal de Afiliados em Configuracoes."
      };
    }

    try {
      const affiliateUrl = await this.createShortAffiliateLink(params.destinationUrl, tag);
      return {
        affiliateUrl,
        requiresManualInput: false,
        provider: "mercado-livre",
        metadata: { rule: "affiliate-program-createLink", tag }
      };
    } catch (error) {
      return {
        provider: "mercado-livre",
        requiresManualInput: true,
        message: error instanceof Error ? error.message : "Mercado Livre nao gerou o link meli.la."
      };
    }
  }

  async healthCheck(): Promise<ConnectorHealthResult> {
    return {
      ok: true,
      mode: this.env.MELI_AFFILIATE_COOKIE && this.env.MELI_CSRF_TOKEN ? "API" : "ASSISTED",
      message:
        this.env.MELI_AFFILIATE_TAG && this.env.MELI_AFFILIATE_COOKIE && this.env.MELI_CSRF_TOKEN
          ? "Mercado Livre configurado para gerar links meli.la."
          : this.env.MELI_AFFILIATE_TAG
          ? "Tag configurada. Para gerar meli.la automaticamente, informe Cookie e X-CSRF-Token do Portal de Afiliados."
          : "Mercado Livre em modo assistido com garimpo pela vitrine publica de ofertas."
    };
  }

  private async findPublicSearchCategoryId(keyword: string) {
    const hint = getPublicOfferCategoryHint(keyword);
    if (hint) return hint;

    const discoveryUrl = new URL("https://api.mercadolibre.com/sites/MLB/domain_discovery/search");
    discoveryUrl.searchParams.set("q", keyword);
    discoveryUrl.searchParams.set("limit", "1");
    const response = await fetch(discoveryUrl, {
      headers: {
        accept: "application/json",
        "user-agent": "PromoPilot360/0.1"
      }
    }).catch(() => null);
    if (!response?.ok) return undefined;

    const payload = (await response.json().catch(() => [])) as Array<{ category_id?: string }>;
    return payload[0]?.category_id;
  }

  private toOfferCandidate(item: MercadoLivreSearchItem, preferredCategory?: string): OfferCandidate {
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
      affiliateUrl: undefined,
      currentPrice,
      oldPrice,
      discountPercent,
      imageUrl: normalizeImageUrl(item.thumbnail),
      freeShipping: item.shipping?.free_shipping,
      reviewCount: item.sold_quantity,
      category: inferCategoryFromText(
        [item.title, item.domain_id, item.attributes?.find((attribute) => attribute.id === "BRAND")?.value_name]
          .filter(Boolean)
          .join(" "),
        preferredCategory
      ) ?? item.domain_id,
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

  private async createShortAffiliateLink(destinationUrl: string, tag: string) {
    const cookie = await this.refreshAffiliateCookie();
    const response = await fetch("https://www.mercadolivre.com.br/affiliate-program/api/v2/affiliates/createLink", {
      method: "POST",
      headers: {
        accept: "application/json, text/plain, */*",
        "accept-language": "pt-BR,pt;q=0.9,en;q=0.7",
        "content-type": "application/json",
        cookie,
        origin: "https://www.mercadolivre.com.br",
        referer: "https://www.mercadolivre.com.br/afiliados/linkbuilder",
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "same-origin",
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36",
        "x-csrf-token": this.env.MELI_CSRF_TOKEN ?? ""
      },
      body: JSON.stringify({ urls: [destinationUrl], tag })
    });
    const text = await response.text();
    if (!response.ok) {
      const details = extractMessageFromText(text);
      throw new Error(
        `Mercado Livre recusou a geracao do meli.la (${response.status}). Atualize Cookie e X-CSRF-Token nas configuracoes.${details ? ` Detalhe: ${details}` : ""}`
      );
    }

    const affiliateUrl = extractMeliShortLink(text);
    if (!affiliateUrl) {
      throw new Error("Mercado Livre respondeu sem link meli.la. Atualize Cookie e X-CSRF-Token e tente novamente.");
    }
    return affiliateUrl;
  }

  private async refreshAffiliateCookie() {
    const baseCookie = this.env.MELI_AFFILIATE_COOKIE ?? "";
    const response = await fetch("https://www.mercadolivre.com.br/afiliados/linkbuilder", {
      headers: {
        accept: "text/html,application/xhtml+xml",
        cookie: baseCookie,
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36"
      }
    }).catch(() => null);

    const setCookie = response?.headers.get("set-cookie") ?? "";
    return mergeCookieHeader(baseCookie, setCookie);
  }
}

function mergeCookieHeader(cookie: string, setCookieHeader: string) {
  const cookieMap = new Map<string, string>();
  for (const part of cookie.split(";")) {
    const [rawKey, ...rawValue] = part.trim().split("=");
    if (rawKey && rawValue.length) cookieMap.set(rawKey, rawValue.join("="));
  }

  for (const part of splitSetCookieHeader(setCookieHeader)) {
    const first = part.split(";")[0]?.trim();
    if (!first) continue;
    const [rawKey, ...rawValue] = first.split("=");
    if (rawKey && rawValue.length) cookieMap.set(rawKey, rawValue.join("="));
  }

  return [...cookieMap.entries()].map(([key, value]) => `${key}=${value}`).join("; ");
}

function splitSetCookieHeader(value: string) {
  if (!value) return [];
  return value.split(/,(?=\s*[^;,]+=)/g);
}

function extractMeliShortLink(text: string) {
  const direct = text.match(/https?:\/\/meli\.la\/[A-Za-z0-9_-]+/i)?.[0];
  if (direct) return direct;

  try {
    const payload = JSON.parse(text) as unknown;
    return findMeliShortLink(payload);
  } catch {
    return undefined;
  }
}

function findMeliShortLink(value: unknown): string | undefined {
  if (typeof value === "string") {
    const normalized = value.startsWith("meli.la/") ? `https://${value}` : value;
    return normalized.match(/^https?:\/\/meli\.la\/[A-Za-z0-9_-]+/i)?.[0];
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findMeliShortLink(item);
      if (found) return found;
    }
  }
  if (value && typeof value === "object") {
    for (const item of Object.values(value)) {
      const found = findMeliShortLink(item);
      if (found) return found;
    }
  }
  return undefined;
}

function extractMessageFromText(text: string) {
  if (!text) return "";
  try {
    const payload = JSON.parse(text) as Record<string, unknown>;
    const message = payload.message ?? payload.error_description ?? payload.error;
    return typeof message === "string" ? message.slice(0, 180) : "";
  } catch {
    return text.replace(/\s+/g, " ").slice(0, 180);
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
  paging?: {
    total?: number;
    offset?: number;
    limit?: number;
  };
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

const categoryTerms: Record<string, string[]> = {
  fitness: [
    "academia",
    "atividade fisica",
    "bike",
    "bicicleta",
    "colchonete",
    "corrida",
    "creatina",
    "elastico",
    "esteira",
    "exercicio",
    "halter",
    "musculacao",
    "pre treino",
    "protein",
    "proteina",
    "shaker",
    "suplemento",
    "treino",
    "whey",
    "yoga"
  ],
  alimentos: [
    "acucar",
    "alimento",
    "arroz",
    "aveia",
    "azeite",
    "biscoito",
    "cafe",
    "cha",
    "feijao",
    "leite",
    "macarrao",
    "molho",
    "tempero"
  ],
  suplementos: [
    "bcaa",
    "colageno",
    "creatina",
    "glutamina",
    "hipercalorico",
    "multivitaminico",
    "omega",
    "pre treino",
    "protein",
    "proteina",
    "suplemento",
    "vitamina",
    "whey"
  ],
  beleza: ["beleza", "cabelo", "creme", "maquiagem", "pele", "perfume", "sabonete", "shampoo"],
  moda: ["bermuda", "bolsa", "camisa", "camiseta", "calca", "moda", "sapato", "tenis", "vestido"],
  "casa e jardim": ["casa", "cozinha", "decoracao", "ferramenta", "jardim", "limpeza", "lustre", "mesa", "panela"],
  eletronicos: ["camera", "carregador", "celular", "fone", "monitor", "notebook", "smartphone", "tablet", "tv"],
  infantil: ["bebe", "brinquedo", "crianca", "fralda", "infantil", "mamadeira"],
  pets: ["cao", "cachorro", "gato", "pet", "racao", "tapete higienico"]
};

const publicOfferCategoryHints: Array<{ terms: string[]; categoryId: string }> = [
  { terms: ["tenis", "sneaker", "calcado", "calcados", "sapato", "corrida", "caminhada", "academia"], categoryId: "MLB23332" },
  { terms: ["tv", "televisor", "smart tv"], categoryId: "MLB1002" },
  { terms: ["creatina", "whey", "suplemento", "suplementos"], categoryId: "MLB122102" },
  { terms: ["air fryer", "fritadeira eletrica", "fritadeira sem oleo"], categoryId: "MLB456045" },
  { terms: ["camisa", "camiseta", "blusa"], categoryId: "MLB1430" },
  { terms: ["geladeira", "refrigerador", "freezer"], categoryId: "MLB181294" }
];

function getPublicOfferCategoryHint(value: string) {
  const normalized = normalizeSearchText(value);
  return publicOfferCategoryHints.find((hint) => hint.terms.some((term) => normalized.includes(term)))?.categoryId;
}

function buildSearchQueries(params: SearchOffersParams) {
  const keyword = params.keyword?.trim();
  const category = params.category?.trim();
  const normalizedCategory = category ? normalizeSearchText(category) : "";

  if (keyword && category) {
    return uniqueStrings([`${category} ${keyword}`, keyword]);
  }

  if (keyword) return [keyword];

  if (category) {
    return uniqueStrings([category, ...(categoryTerms[normalizedCategory] ?? []).slice(0, 8)]);
  }

  return ["ofertas"];
}

function applyOfferFilters(candidates: OfferCandidate[], params: SearchOffersParams) {
  const keywordWords = normalizeSearchText(params.keyword ?? "")
    .split(/\s+/)
    .map((word) => word.trim())
    .filter((word) => word.length >= 2 && !["oferta", "ofertas", "promocao", "promocoes"].includes(word));
  const keywordAliases = getKeywordAliases(params.keyword);

  return candidates.filter((candidate) => {
    const haystack = getCandidateSearchText(candidate);
    if (params.category && !matchesCategory(haystack, params.category)) return false;
    if (keywordAliases.length) {
      if (!keywordAliases.some((word) => matchesKeywordWord(haystack, word))) return false;
    } else if (keywordWords.length) {
      if (!keywordWords.every((word) => matchesKeywordWord(haystack, word))) return false;
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

function applyBasicOfferFilters(candidates: OfferCandidate[], params: SearchOffersParams) {
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

function rankPublicCandidates(candidates: OfferCandidate[], params: SearchOffersParams) {
  return [...candidates].sort((a, b) => {
    const relevance = getPublicCandidateRelevance(b, params) - getPublicCandidateRelevance(a, params);
    if (relevance !== 0) return relevance;
    return (b.score ?? 0) - (a.score ?? 0);
  });
}

function getPublicCandidateRelevance(candidate: OfferCandidate, params: SearchOffersParams) {
  const haystack = getCandidateSearchText(candidate);
  const keyword = normalizeSearchText(params.keyword ?? "");
  const keywordWords = keyword
    .split(/\s+/)
    .map((word) => word.trim())
    .filter((word) => word.length >= 2 && !["oferta", "ofertas", "promocao", "promocoes"].includes(word));
  const aliases = getKeywordAliases(params.keyword);

  if (keyword && haystack.includes(keyword)) return 5;
  if (aliases.length && aliases.some((word) => matchesKeywordWord(haystack, word))) return 4;
  if (keywordWords.length && keywordWords.some((word) => matchesKeywordWord(haystack, word))) return 3;
  if (params.category && matchesCategory(haystack, params.category)) return 2;
  if (candidate.category) return 1;
  return 0;
}

function mergeCandidates(primary: OfferCandidate[], fallback: OfferCandidate[]) {
  const seen = new Set<string>();
  const result: OfferCandidate[] = [];
  for (const candidate of [...primary, ...fallback]) {
    const key = candidate.externalId ?? candidate.productUrl;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(candidate);
  }
  return result;
}

function getKeywordAliases(keyword?: string) {
  const normalized = normalizeSearchText(keyword ?? "");
  if (["corrida", "correr", "run", "running"].some((term) => normalized.includes(term))) {
    return ["corrida", "tenis", "academia", "caminhada"];
  }
  if (["geladeira", "refrigerador", "freezer"].some((term) => normalized.includes(term))) {
    return ["geladeira", "refrigerador", "freezer"];
  }
  return [];
}

function matchesKeywordWord(normalizedHaystack: string, word: string) {
  if (word.length <= 2) {
    return new RegExp(`(^|[^a-z0-9])${escapeRegExp(word)}([^a-z0-9]|$)`).test(normalizedHaystack);
  }
  return normalizedHaystack.includes(word);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function uniqueStrings(values: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = value.trim();
    const key = normalizeSearchText(normalized);
    if (!normalized || seen.has(key)) continue;
    seen.add(key);
    result.push(normalized);
  }
  return result;
}

function getCandidateSearchText(candidate: OfferCandidate) {
  return normalizeSearchText(
    [candidate.title, candidate.description, candidate.brand, candidate.category].filter(Boolean).join(" ")
  );
}

function matchesCategory(normalizedHaystack: string, category: string) {
  const normalizedCategory = normalizeSearchText(category);
  const terms = [
    ...normalizedCategory.split(/\s+/).filter((word) => word.length > 2),
    ...(categoryTerms[normalizedCategory] ?? [])
  ].map(normalizeSearchText);
  return [...new Set(terms)].some((term) => normalizedHaystack.includes(term));
}

function inferCategoryFromText(text: string, preferredCategory?: string) {
  const normalizedText = normalizeSearchText(text);
  if (preferredCategory && matchesCategory(normalizedText, preferredCategory)) return preferredCategory;

  for (const category of Object.keys(categoryTerms)) {
    if (matchesCategory(normalizedText, category)) return toDisplayCategory(category);
  }

  return undefined;
}

function toDisplayCategory(category: string) {
  return category
    .split(" ")
    .map((word) => (word.length <= 1 ? word : `${word[0]?.toUpperCase()}${word.slice(1)}`))
    .join(" ");
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
