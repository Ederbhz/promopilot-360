import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../lib/http.js";
import { prisma } from "../lib/prisma.js";
import { indexVectorDocuments, listMlModels, predictPerformance, searchVectorMemory, trainMlModel } from "../services/agents.js";

const router = Router();

router.post(
  "/train",
  asyncHandler(async (_req, res) => {
    res.json(await trainMlModel());
  })
);

router.post(
  "/predict",
  asyncHandler(async (req, res) => {
    const data = z
      .object({
        productId: z.string().uuid(),
        channel: z.string().optional(),
        hour: z.coerce.number().int().min(0).max(23).optional()
      })
      .parse(req.body ?? {});
    res.status(201).json(await predictPerformance(data));
  })
);

router.get(
  "/models",
  asyncHandler(async (_req, res) => {
    res.json(await listMlModels());
  })
);

router.get(
  "/predictions",
  asyncHandler(async (_req, res) => {
    const predictions = await prisma.mlPrediction.findMany({
      include: { product: { include: { marketplace: true } } },
      orderBy: { createdAt: "desc" },
      take: 200
    });
    res.json(predictions);
  })
);

router.post(
  "/vector-documents/index",
  asyncHandler(async (req, res) => {
    const data = z.object({ limit: z.coerce.number().int().min(1).max(500).default(100) }).parse(req.body ?? {});
    res.json(await indexVectorDocuments(data.limit));
  })
);

router.get(
  "/vector-documents/search",
  asyncHandler(async (req, res) => {
    const query = z.string().min(1).parse(req.query.q);
    res.json(await searchVectorMemory(query));
  })
);

export default router;
