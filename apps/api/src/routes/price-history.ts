import { Router } from "express";
import { z } from "zod";
import { asyncHandler, HttpError } from "../lib/http.js";
import { prisma } from "../lib/prisma.js";
import { recordPriceHistoryForOffer } from "../services/intelligence.js";

const router = Router();

router.get(
  "/:productId",
  asyncHandler(async (req, res) => {
    const history = await prisma.priceHistory.findMany({
      where: { productId: req.params.productId },
      include: { marketplace: true },
      orderBy: { dataColeta: "desc" },
      take: 200
    });
    res.json(history);
  })
);

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const data = z
      .object({
        offerId: z.string().uuid().optional(),
        productId: z.string().uuid().optional(),
        marketplaceId: z.string().uuid().optional(),
        preco: z.coerce.number().positive().optional(),
        precoAnterior: z.coerce.number().positive().optional(),
        origem: z.string().trim().default("manual")
      })
      .parse(req.body ?? {});

    if (data.offerId) {
      const history = await recordPriceHistoryForOffer(data.offerId, data.origem);
      if (!history) throw new HttpError(400, "Oferta sem preco atual para registrar historico.");
      res.status(201).json(history);
      return;
    }

    if (!data.productId || data.preco === undefined) {
      throw new HttpError(400, "Informe offerId ou productId com preco.");
    }

    const product = await prisma.product.findFirst({ where: { id: data.productId, deletedAt: null } });
    if (!product) throw new HttpError(404, "Produto nao encontrado.");

    const last = await prisma.priceHistory.findFirst({
      where: { productId: product.id },
      orderBy: { dataColeta: "desc" }
    });
    if (last && Number(last.preco) === data.preco) {
      res.json(last);
      return;
    }

    const history = await prisma.priceHistory.create({
      data: {
        productId: product.id,
        marketplaceId: data.marketplaceId ?? product.marketplaceId,
        preco: data.preco,
        precoAnterior: data.precoAnterior,
        origem: data.origem,
        statusDesconto: "sem_historico"
      }
    });
    res.status(201).json(history);
  })
);

export default router;
