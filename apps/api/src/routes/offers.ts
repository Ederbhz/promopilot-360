import { IntegrationType, MarketplaceKey, OfferStatus } from "@prisma/client";
import { Router } from "express";
import { nanoid } from "nanoid";
import { z } from "zod";
import {
  calculateOfferScore,
  detectMarketplaceKey,
  manualUrlSchema,
  messageRenderSchema,
  searchOffersSchema,
  type OfferCandidate,
  type ProductExtractionResult
} from "@promopilot/shared";
import { asyncHandler, HttpError } from "../lib/http.js";
import { prisma } from "../lib/prisma.js";
import { jsonInput } from "../lib/sanitize.js";
import { connectors } from "../services/connectors.js";
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

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const status = typeof req.query.status === "string" ? (req.query.status as OfferStatus) : undefined;
    const marketplaceId = typeof req.query.marketplaceId === "string" ? req.query.marketplaceId : undefined;
    const offers = await prisma.offer.findMany({
      where: {
        status,
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
    res.json(offers);
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
    for (const key of keys) {
      const connector = connectors[key] ?? connectors.MANUAL;
      const results = await connector.searchOffers({ ...params, marketplaceKey: key });
      candidates.push(...results);
    }

    const saved = [];
    for (const candidate of candidates) {
      saved.push(await persistCandidate({ ...candidate, score: candidate.score ?? calculateOfferScore(candidate) }));
    }

    res.json({ count: saved.length, offers: saved });
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
        data: { affiliateUrl: body.affiliateUrl, status: OfferStatus.VALID }
      });
      res.json({ result: { requiresManualInput: false, affiliateUrl: body.affiliateUrl }, offer: updated });
      return;
    }

    const connector = connectors[offer.marketplace.key] ?? connectors.MANUAL;
    const result = await connector.generateAffiliateLink({
      marketplaceKey: offer.marketplace.key,
      destinationUrl: offer.originalUrl
    });
    const updated = await prisma.offer.update({
      where: { id: offer.id },
      data: {
        affiliateUrl: result.affiliateUrl,
        status: result.affiliateUrl ? OfferStatus.VALID : OfferStatus.AFFILIATE_LINK_MISSING,
        metadata: jsonInput({
          ...((offer.metadata as Record<string, unknown> | null) ?? {}),
          affiliateProvider: result.provider,
          affiliateMetadata: result.metadata ?? null
        })
      }
    });
    res.json({ result, offer: updated });
  })
);

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
          category: candidate.category,
          rating: candidate.rating,
          reviewCount: candidate.reviewCount,
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
          category: candidate.category,
          rating: candidate.rating,
          reviewCount: candidate.reviewCount
        }
      });

  const score = candidate.score ?? calculateOfferScore(candidate);
  return prisma.offer.create({
    data: {
      productId: product.id,
      marketplaceId: marketplace.id,
      originalUrl: candidate.productUrl,
      affiliateUrl: candidate.affiliateUrl,
      currentPrice: candidate.currentPrice,
      oldPrice: candidate.oldPrice,
      discountPercent: candidate.discountPercent,
      couponCode: candidate.couponCode,
      couponDescription: candidate.couponDescription,
      freeShipping: candidate.freeShipping,
      estimatedCommission: candidate.estimatedCommission,
      commissionPercent: candidate.commissionPercent,
      score,
      status: candidate.affiliateUrl ? OfferStatus.VALID : OfferStatus.AFFILIATE_LINK_MISSING,
      metadata: jsonInput(candidate.metadata)
    },
    include: { product: true, marketplace: true }
  });
}

async function ensureMarketplace(key: MarketplaceKey) {
  const defaults = defaultMarketplaceNames[key];
  return prisma.marketplace.upsert({
    where: { key },
    update: {},
    create: {
      key,
      name: defaults.name,
      integrationType: defaults.integrationType,
      baseUrl: defaults.baseUrl
    }
  });
}

export default router;
