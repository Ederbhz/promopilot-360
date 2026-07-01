import { IntegrationType, MarketplaceKey } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { connectors } from "../services/connectors.js";
import { asyncHandler, HttpError } from "../lib/http.js";
import { prisma } from "../lib/prisma.js";

const router = Router();

const marketplaceSchema = z.object({
  name: z.string().min(2),
  key: z.nativeEnum(MarketplaceKey),
  integrationType: z.nativeEnum(IntegrationType),
  baseUrl: z.string().url().optional().nullable(),
  isActive: z.boolean().default(true)
});

router.get(
  "/",
  asyncHandler(async (_req, res) => {
    const marketplaces = await prisma.marketplace.findMany({
      orderBy: { name: "asc" },
      include: { _count: { select: { offers: true, affiliateAccounts: true } } }
    });
    const health = await Promise.all(
      marketplaces.map(async (marketplace) => ({
        key: marketplace.key,
        health: await connectors[marketplace.key].healthCheck()
      }))
    );
    const healthByKey = Object.fromEntries(health.map((item) => [item.key, item.health]));
    res.json(marketplaces.map((marketplace) => ({ ...marketplace, health: healthByKey[marketplace.key] })));
  })
);

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const data = marketplaceSchema.parse(req.body);
    const marketplace = await prisma.marketplace.create({ data });
    res.status(201).json(marketplace);
  })
);

router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const marketplace = await prisma.marketplace.findUnique({
      where: { id: req.params.id },
      include: { affiliateAccounts: true }
    });
    if (!marketplace) throw new HttpError(404, "Marketplace nao encontrado.");
    res.json(marketplace);
  })
);

router.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const data = marketplaceSchema.partial().parse(req.body);
    const marketplace = await prisma.marketplace.update({ where: { id: req.params.id }, data });
    res.json(marketplace);
  })
);

router.patch(
  "/:id/status",
  asyncHandler(async (req, res) => {
    const data = z.object({ isActive: z.boolean() }).parse(req.body);
    const marketplace = await prisma.marketplace.update({ where: { id: req.params.id }, data });
    res.json(marketplace);
  })
);

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    await prisma.marketplace.delete({ where: { id: req.params.id } });
    res.status(204).end();
  })
);

export default router;
