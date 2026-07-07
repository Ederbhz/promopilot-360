import { IntegrationType, MarketplaceKey, OfferStatus, Prisma } from "@prisma/client";
import { Router } from "express";
import { nanoid } from "nanoid";
import { z } from "zod";
import {
  calculateOfferScore,
  detectMarketplaceKey,
  manualUrlSchema,
  messageRenderSchema,
  opportunityRadarSchema,
  searchOffersSchema,
  type OfferCandidate,
  type ProductExtractionResult
} from "@promopilot/shared";
import { asyncHandler, HttpError } from "../lib/http.js";
import { prisma } from "../lib/prisma.js";
import { jsonInput } from "../lib/sanitize.js";
import { slugify } from "../lib/slug.js";
import { connectors, getConnectorForMarketplace } from "../services/connectors.js";
import { renderOfferMessage } from "../services/message-service.js";
import { env } from "../config/env.js";

const router = Router();

const defaultMarketplaceNames: Record<MarketplaceKey, { name: string; integrationType: IntegrationType; baseUrl?: string }> = {
  AWIN: { name: "Natura via Awin", integrationType: IntegrationType.FEED, baseUrl: "https://www.natura.com.br" },
  SHOPEE: { name: "Shopee", integrationType: IntegrationType.API, baseUrl: "https://shopee.com.br" },
  MERCADO_LIVRE: {
    name: "Mercado Livre",
    integrationType: IntegrationType.ASSISTED,
    baseUrl: "https://www.mercadolivre.com.br"
  },
  MAGALU: { name: "Magalu", integrationType: IntegrationType.ASSISTED, baseUrl: "https://www.magazineluiza.com.br" },
  MANUAL: { name: "Manual", integrationType: IntegrationType.MANUAL }
};

const offerCardInclude = { product: true, marketplace: true } as const;
const unavailableForGarimpoStatuses: OfferStatus[] = [OfferStatus.VALID, OfferStatus.SCHEDULED, OfferStatus.PUBLISHED];
const generatedOfferWhere: Prisma.OfferWhereInput = {
  affiliateUrl: { not: null }
};
const garimpoOfferWhere: Prisma.OfferWhereInput = {
  affiliateUrl: null,
  status: { notIn: unavailableForGarimpoStatuses }
};

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const status = typeof req.query.status === "string" ? (req.query.status as OfferStatus) : undefined;
    const scope = typeof req.query.scope === "string" ? req.query.scope : undefined;
    const marketplaceId = typeof req.query.marketplaceId === "string" ? req.query.marketplaceId : undefined;
    const scopedWhere =
      scope === "garimpo"
        ? garimpoOfferWhere
        : scope === "generated"
        ? generatedOfferWhere
        : {};
    const offers = await prisma.offer.findMany({
      where: {
        ...scopedWhere,
        ...(status ? { status } : {}),
        marketplaceId
      },
      include: {
        product: true,
        marketplace: true,
        _count: { select: { scheduledPosts: true, clickEvents: true } }
      },
      orderBy: { createdAt: "desc" },
      take: 100
    });
    if (scope !== "garimpo") {
      res.json(offers);
      return;
    }

    const hiddenKeys = await getGeneratedOfferKeys();
    res.json(offers.filter((offer) => !hasGeneratedIdentity(hiddenKeys, offer)));
  })
);

router.post(
  "/manual-url",
  asyncHandler(async (req, res) => {
    const data = manualUrlSchema.parse(req.body);
    const key = detectMarketplaceKey(data.url) as MarketplaceKey;
    const connector = connectors[key] ?? connectors.MANUAL;

    let extraction: ProductExtractionResult;
    try {
      extraction = await connector.extractFromUrl(data.url);
    } catch (error) {
      extraction = {
        marketplaceKey: key,
        title: new URL(data.url).hostname,
        productUrl: data.url,
        metadata: {
          extractionError: error instanceof Error ? error.message : "Falha desconhecida."
        }
      };
    }

    const offer = await persistCandidate({
      marketplaceKey: extraction.marketplaceKey,
      externalId: extraction.externalId,
      title: extraction.title,
      description: extraction.description,
      imageUrl: extraction.imageUrl,
      productUrl: extraction.productUrl,
      currentPrice: extraction.currentPrice,
      oldPrice: extraction.oldPrice,
      discountPercent: extraction.discountPercent,
      rating: extraction.rating,
      reviewCount: extraction.reviewCount,
      freeShipping: extraction.freeShipping,
      brand: extraction.brand,
      category: extraction.category,
      affiliateUrl: data.affiliateUrl || undefined,
      couponCode: data.couponCode,
      score: calculateOfferScore({
        discountPercent: extraction.discountPercent,
        rating: extraction.rating,
        reviewCount: extraction.reviewCount,
        freeShipping: extraction.freeShipping,
        couponCode: data.couponCode
      }),
      metadata: { ...extraction.metadata, notes: data.notes }
    });

    res.status(201).json(offer);
  })
);

router.post(
  "/search",
  asyncHandler(async (req, res) => {
    const params = searchOffersSchema.parse(req.body);
    const keys = params.marketplaceKey
      ? [params.marketplaceKey as MarketplaceKey]
      : (await prisma.marketplace.findMany({ where: { isActive: true } })).map((item) => item.key);

    const candidates: OfferCandidate[] = [];
    const warnings: Array<{ marketplaceKey: string; message: string }> = [];
    for (const key of keys) {
      const connector = await getConnectorForMarketplace(key as MarketplaceKey);
      try {
        const results = await connector.searchOffers({ ...params, marketplaceKey: key });
        candidates.push(...results);
      } catch (error) {
        warnings.push({
          marketplaceKey: key,
          message: error instanceof Error ? error.message : "Falha desconhecida ao buscar ofertas."
        });
      }
    }

    const saved = [];
    let skippedGenerated = 0;
    for (const candidate of candidates) {
      if (await hasGeneratedOfferForCandidate(candidate)) {
        skippedGenerated += 1;
        continue;
      }
      saved.push(await persistCandidate({ ...candidate, score: candidate.score ?? calculateOfferScore(candidate) }));
    }

    res.json({ count: saved.length, offers: saved, warnings, skippedGenerated });
  })
);

router.post(
  "/opportunity-radar",
  asyncHandler(async (req, res) => {
    const params = opportunityRadarSchema.parse(req.body);
    const categories = uniqueRadarCategories(params.categories);
    const targets = buildRadarTargets(params.keyword, categories);
    const keys = params.marketplaceKey
      ? [params.marketplaceKey as MarketplaceKey]
      : [MarketplaceKey.MERCADO_LIVRE];

    if (!keys.length) {
      throw new HttpError(400, "Nenhum marketplace ativo encontrado para o Radar.");
    }

    const warnings: Array<{ marketplaceKey: string; category: string; message: string }> = [];
    const groups: Array<{ category: string; count: number; offers: Awaited<ReturnType<typeof persistCandidate>>[] }> = [];
    const saved: Awaited<ReturnType<typeof persistCandidate>>[] = [];
    const seen = new Set<string>();
    let skippedGenerated = 0;

    for (const target of targets) {
      const groupOffers: Awaited<ReturnType<typeof persistCandidate>>[] = [];

      for (const key of keys) {
        if (groupOffers.length >= params.limitPerCategory) break;

        const connector = await getConnectorForMarketplace(key as MarketplaceKey);
        try {
          const candidates = await connector.searchOffers({
            marketplaceKey: key,
            keyword: target.keyword,
            category: target.category,
            minPrice: params.minPrice,
            maxPrice: params.maxPrice,
            minDiscount: params.minDiscount,
            limit: Math.min(100, Math.max(params.limitPerCategory * 3, params.limitPerCategory)),
            sortBy: params.sortBy
          });

          for (const candidate of candidates) {
            if (groupOffers.length >= params.limitPerCategory) break;

            const identity = getCandidateIdentity(candidate);
            if (seen.has(identity)) continue;
            seen.add(identity);

            const radarCandidate: OfferCandidate = {
              ...candidate,
              category: candidate.category ?? target.category ?? target.label,
              score: candidate.score ?? calculateOfferScore(candidate),
              metadata: {
                ...(candidate.metadata ?? {}),
                radarCategory: target.category ?? null,
                radarKeyword: target.keyword ?? null,
                radarLabel: target.label,
                radarSource: "opportunity-radar",
                radarSortBy: params.sortBy
              }
            };

            if (await hasGeneratedOfferForCandidate(radarCandidate)) {
              skippedGenerated += 1;
              continue;
            }

            const offer = await persistCandidate(radarCandidate);
            groupOffers.push(offer);
            saved.push(offer);
          }
        } catch (error) {
          warnings.push({
            marketplaceKey: key,
            category: target.label,
            message: error instanceof Error ? error.message : "Falha desconhecida ao buscar oportunidades."
          });
        }
      }

      groups.push({ category: target.label, count: groupOffers.length, offers: groupOffers });
    }

    res.json({ count: saved.length, offers: saved, groups, warnings, skippedGenerated });
  })
);

router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const offer = await prisma.offer.findUnique({
      where: { id: req.params.id },
      include: {
        product: true,
        marketplace: true,
        scheduledPosts: { orderBy: { scheduledAt: "desc" } },
        publishLogs: { orderBy: { createdAt: "desc" }, take: 20 },
        shortLinks: true
      }
    });
    if (!offer) throw new HttpError(404, "Oferta nao encontrada.");
    res.json(offer);
  })
);

router.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const data = z
      .object({
        affiliateUrl: z.string().url().optional().nullable(),
        currentPrice: z.coerce.number().optional().nullable(),
        oldPrice: z.coerce.number().optional().nullable(),
        couponCode: z.string().optional().nullable(),
        couponDescription: z.string().optional().nullable(),
        freeShipping: z.boolean().optional().nullable(),
        validUntil: z.coerce.date().optional().nullable(),
        metadata: z.record(z.unknown()).optional()
      })
      .parse(req.body);

    const offer = await prisma.offer.update({
      where: { id: req.params.id },
      data: {
        affiliateUrl: data.affiliateUrl,
        currentPrice: data.currentPrice,
        oldPrice: data.oldPrice,
        couponCode: data.couponCode,
        couponDescription: data.couponDescription,
        freeShipping: data.freeShipping,
        validUntil: data.validUntil,
        metadata: jsonInput(data.metadata),
        status: data.affiliateUrl ? OfferStatus.VALID : undefined
      },
      include: { product: true, marketplace: true }
    });
    res.json(offer);
  })
);

router.post(
  "/:id/validate",
  asyncHandler(async (req, res) => {
    const offer = await prisma.offer.findUnique({
      where: { id: req.params.id },
      include: { marketplace: true }
    });
    if (!offer) throw new HttpError(404, "Oferta nao encontrada.");

    const status = offer.affiliateUrl ? OfferStatus.VALID : OfferStatus.AFFILIATE_LINK_MISSING;
    const updated = await prisma.offer.update({
      where: { id: offer.id },
      data: { status }
    });
    res.json(updated);
  })
);

router.post(
  "/:id/generate-affiliate-link",
  asyncHandler(async (req, res) => {
    const body = z.object({ affiliateUrl: z.string().url().optional() }).parse(req.body ?? {});
    const offer = await prisma.offer.findUnique({
      where: { id: req.params.id },
      include: { marketplace: true }
    });
    if (!offer) throw new HttpError(404, "Oferta nao encontrada.");

    if (body.affiliateUrl) {
      const updated = await prisma.offer.update({
        where: { id: offer.id },
        data: { affiliateUrl: body.affiliateUrl, status: OfferStatus.VALID },
        include: offerCardInclude
      });
      res.json({ result: { requiresManualInput: false, affiliateUrl: body.affiliateUrl }, offer: updated });
      return;
    }

    const connector = await getConnectorForMarketplace(offer.marketplace.key);
    const result = await connector.generateAffiliateLink({
      marketplaceKey: offer.marketplace.key,
      destinationUrl: offer.originalUrl
    });
    const keepExistingAffiliateUrl =
      offer.affiliateUrl && !(offer.marketplace.key === "MERCADO_LIVRE" && !isMeliShortLink(offer.affiliateUrl));
    const affiliateUrl = result.affiliateUrl ?? (keepExistingAffiliateUrl ? offer.affiliateUrl : null);
    const updated = await prisma.offer.update({
      where: { id: offer.id },
      data: {
        affiliateUrl,
        status: affiliateUrl ? OfferStatus.VALID : OfferStatus.AFFILIATE_LINK_MISSING,
        metadata: jsonInput({
          ...((offer.metadata as Record<string, unknown> | null) ?? {}),
          affiliateProvider: result.provider,
          affiliateMetadata: result.metadata ?? null
        })
      },
      include: offerCardInclude
    });
    res.json({ result, offer: updated });
  })
);

function isMeliShortLink(value: string) {
  try {
    return new URL(value).hostname.toLowerCase() === "meli.la";
  } catch {
    return false;
  }
}

router.post(
  "/:id/generate-message",
  asyncHandler(async (req, res) => {
    const data = messageRenderSchema.partial().parse(req.body ?? {});
    const rendered = await renderOfferMessage(
      req.params.id!,
      data.channel ?? "WHATSAPP",
      data.templateId
    );
    res.json({ message: rendered.message, template: rendered.template });
  })
);

router.patch(
  "/:id/status",
  asyncHandler(async (req, res) => {
    const data = z.object({ status: z.nativeEnum(OfferStatus) }).parse(req.body);
    const offer = await prisma.offer.update({ where: { id: req.params.id }, data });
    res.json(offer);
  })
);

router.post(
  "/:id/short-link",
  asyncHandler(async (req, res) => {
    const offer = await prisma.offer.findUnique({ where: { id: req.params.id } });
    if (!offer) throw new HttpError(404, "Oferta nao encontrada.");
    const destinationUrl = offer.affiliateUrl || offer.originalUrl;
    const shortLink = await prisma.shortLink.create({
      data: {
        offerId: offer.id,
        code: nanoid(8),
        destinationUrl
      }
    });
    res.status(201).json({
      ...shortLink,
      url: `${env.SHORT_LINK_DOMAIN}/${shortLink.code}`
    });
  })
);

async function persistCandidate(candidate: OfferCandidate) {
  const key = (candidate.marketplaceKey || "MANUAL") as MarketplaceKey;
  const marketplace = await ensureMarketplace(key);
  const productRating = normalizeNumber(candidate.rating, 0, 5);
  const productReviewCount = normalizeInteger(candidate.reviewCount, 0);
  const currentPrice = normalizeNumber(candidate.currentPrice, 0, 9999999999.99);
  const oldPrice = normalizeNumber(candidate.oldPrice, 0, 9999999999.99);
  const discountPercent = normalizeNumber(candidate.discountPercent, 0, 100);
  const estimatedCommission = normalizeNumber(candidate.estimatedCommission, 0, 9999999999.99);
  const commissionPercent = normalizeNumber(candidate.commissionPercent, 0, 999.99);
  const score = normalizeNumber(candidate.score ?? calculateOfferScore(candidate), 0, 999.99);
  const categoryId = candidate.category ? (await ensureCategory(candidate.category)).id : undefined;
  const brandId = candidate.brand ? (await ensureBrand(candidate.brand)).id : undefined;
  const existingProduct = await prisma.product.findFirst({
    where: {
      marketplaceId: marketplace.id,
      productUrl: candidate.productUrl
    }
  });
  const product = existingProduct
    ? await prisma.product.update({
        where: { id: existingProduct.id },
        data: {
          title: candidate.title,
          description: candidate.description,
          imageUrl: candidate.imageUrl,
          brand: candidate.brand,
          brandId,
          category: candidate.category,
          categoryId,
          rating: productRating,
          reviewCount: productReviewCount,
          externalId: candidate.externalId
        }
      })
    : await prisma.product.create({
        data: {
          marketplaceId: marketplace.id,
          externalId: candidate.externalId,
          title: candidate.title,
          description: candidate.description,
          imageUrl: candidate.imageUrl,
          productUrl: candidate.productUrl,
          brand: candidate.brand,
          brandId,
          category: candidate.category,
          categoryId,
          rating: productRating,
          reviewCount: productReviewCount
        }
      });

  const offerData = {
    originalUrl: candidate.productUrl,
    affiliateUrl: candidate.affiliateUrl,
    currentPrice,
    oldPrice,
    discountPercent,
    couponCode: candidate.couponCode,
    couponDescription: candidate.couponDescription,
    freeShipping: candidate.freeShipping,
    estimatedCommission,
    commissionPercent,
    score,
    status: candidate.affiliateUrl ? OfferStatus.VALID : OfferStatus.AFFILIATE_LINK_MISSING,
    metadata: jsonInput(candidate.metadata)
  };

  const existingPendingOffer = !candidate.affiliateUrl
    ? await prisma.offer.findFirst({
        where: {
          productId: product.id,
          ...garimpoOfferWhere
        },
        orderBy: { createdAt: "desc" }
      })
    : null;

  if (existingPendingOffer) {
    return prisma.offer.update({
      where: { id: existingPendingOffer.id },
      data: offerData,
      include: { product: true, marketplace: true }
    });
  }

  return prisma.offer.create({
    data: {
      productId: product.id,
      marketplaceId: marketplace.id,
      ...offerData
    },
    include: { product: true, marketplace: true }
  });
}

async function hasGeneratedOfferForCandidate(candidate: OfferCandidate) {
  const key = (candidate.marketplaceKey || "MANUAL") as MarketplaceKey;
  const marketplace = await ensureMarketplace(key);
  return Boolean(
    await prisma.offer.findFirst({
      where: {
        marketplaceId: marketplace.id,
        AND: [
          generatedOfferWhere,
          {
            OR: [
              { originalUrl: candidate.productUrl },
              { product: { productUrl: candidate.productUrl } },
              ...(candidate.externalId ? [{ product: { externalId: candidate.externalId } }] : [])
            ]
          }
        ]
      },
      select: { id: true }
    })
  );
}

async function getGeneratedOfferKeys() {
  const generatedOffers = await prisma.offer.findMany({
    where: generatedOfferWhere,
    include: { product: true }
  });
  const urls = new Set<string>();
  const externalIds = new Set<string>();
  for (const offer of generatedOffers) {
    urls.add(offer.originalUrl);
    urls.add(offer.product.productUrl);
    if (offer.product.externalId) externalIds.add(offer.product.externalId);
  }
  return { urls, externalIds };
}

function hasGeneratedIdentity(
  keys: { urls: Set<string>; externalIds: Set<string> },
  offer: { originalUrl: string; product: { productUrl: string; externalId?: string | null } }
) {
  return (
    keys.urls.has(offer.originalUrl) ||
    keys.urls.has(offer.product.productUrl) ||
    Boolean(offer.product.externalId && keys.externalIds.has(offer.product.externalId))
  );
}

function uniqueRadarCategories(categories: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const category of categories) {
    const value = category.trim();
    const key = value.toLowerCase();
    if (!value || seen.has(key)) continue;
    seen.add(key);
    result.push(value);
  }
  return result;
}

function buildRadarTargets(keyword: string | undefined, categories: string[]) {
  const cleanKeyword = keyword?.trim();
  if (cleanKeyword) {
    return [{ label: cleanKeyword, keyword: cleanKeyword, category: undefined }];
  }

  return categories.map((category) => ({ label: category, keyword: undefined, category }));
}

function getCandidateIdentity(candidate: OfferCandidate) {
  return `${candidate.marketplaceKey}|${candidate.externalId ?? candidate.productUrl}`;
}

function normalizeNumber(value: unknown, min: number, max: number) {
  if (value === null || value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return undefined;
  return Math.min(Math.max(parsed, min), max);
}

function normalizeInteger(value: unknown, min: number) {
  const normalized = normalizeNumber(value, min, Number.MAX_SAFE_INTEGER);
  return normalized === undefined ? undefined : Math.round(normalized);
}

async function ensureMarketplace(key: MarketplaceKey) {
  const defaults = defaultMarketplaceNames[key];
  return prisma.marketplace.upsert({
    where: { key },
    update: { deletedAt: null, isActive: true },
    create: {
      key,
      name: defaults.name,
      integrationType: defaults.integrationType,
      baseUrl: defaults.baseUrl
    }
  });
}

async function ensureCategory(name: string) {
  const slug = slugify(name);
  if (!slug) throw new HttpError(400, "Categoria invalida.");
  return prisma.category.upsert({
    where: { slug },
    update: { name, isActive: true, deletedAt: null },
    create: { name, slug }
  });
}

async function ensureBrand(name: string) {
  const slug = slugify(name);
  if (!slug) throw new HttpError(400, "Marca invalida.");
  return prisma.brand.upsert({
    where: { slug },
    update: { name, isActive: true, deletedAt: null },
    create: { name, slug }
  });
}

export default router;
