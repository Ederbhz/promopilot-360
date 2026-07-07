import { Router } from "express";
import { z } from "zod";
import { asyncHandler, HttpError } from "../lib/http.js";
import { prisma } from "../lib/prisma.js";
import {
  analyzeOfferIntelligence,
  calculateOfferScoreForOffer,
  getIntelligenceDashboard,
  getOfferRanking,
  runIntelligenceJobs
} from "../services/intelligence.js";

const router = Router();

router.get(
  "/dashboard",
  asyncHandler(async (_req, res) => {
    res.json(await getIntelligenceDashboard());
  })
);

router.get(
  "/ranking",
  asyncHandler(async (req, res) => {
    const query = z
      .object({
        marketplaceId: z.string().uuid().optional(),
        categoryId: z.string().uuid().optional(),
        scoreMinimo: z.coerce.number().min(0).max(100).optional(),
        cupomAtivo: z.coerce.boolean().optional(),
        freteGratis: z.coerce.boolean().optional(),
        limit: z.coerce.number().int().min(1).max(200).optional()
      })
      .parse(req.query);
    res.json(await getOfferRanking(query));
  })
);

router.get(
  "/opportunities",
  asyncHandler(async (_req, res) => {
    const opportunities = await prisma.productOpportunity.findMany({
      include: { product: { include: { marketplace: true, categoryRef: true } }, score: true },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      take: 200
    });
    res.json(opportunities);
  })
);

router.post(
  "/offers/:offerId/analyze",
  asyncHandler(async (req, res) => {
    const offer = await prisma.offer.findUnique({ where: { id: req.params.offerId } });
    if (!offer) throw new HttpError(404, "Oferta nao encontrada.");
    res.json(await analyzeOfferIntelligence(offer.id, "manual"));
  })
);

router.post(
  "/offers/:offerId/calculate-score",
  asyncHandler(async (req, res) => {
    const score = await calculateOfferScoreForOffer(req.params.offerId!);
    if (!score) throw new HttpError(404, "Oferta nao encontrada.");
    res.json(score);
  })
);

router.post(
  "/jobs/run",
  asyncHandler(async (req, res) => {
    const data = z.object({ limit: z.coerce.number().int().min(1).max(500).default(50) }).parse(req.body ?? {});
    res.json(await runIntelligenceJobs(data.limit));
  })
);

export default router;
