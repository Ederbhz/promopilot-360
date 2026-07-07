import { Router } from "express";
import { z } from "zod";
import { Channel } from "@prisma/client";
import { asyncHandler, HttpError } from "../lib/http.js";
import { prisma } from "../lib/prisma.js";
import { jsonInput } from "../lib/sanitize.js";
import { renderOfferMessage } from "../services/message-service.js";
import { publishInstagramContent, testInstagramConnection } from "../services/instagram.js";
import { sendTelegramMessage, testTelegramConnection } from "../services/telegram.js";

const router = Router();

router.post(
  "/telegram/test",
  asyncHandler(async (_req, res) => {
    res.json(await testTelegramConnection());
  })
);

router.post(
  "/telegram/send",
  asyncHandler(async (req, res) => {
    const data = z
      .object({
        chatId: z.string().optional(),
        message: z.string().min(1),
        imageUrl: z.string().url().optional()
      })
      .parse(req.body);
    res.json(await sendTelegramMessage(data));
  })
);

router.post(
  "/instagram/test",
  asyncHandler(async (_req, res) => {
    res.json(await testInstagramConnection());
  })
);

router.post(
  "/instagram/publish",
  asyncHandler(async (req, res) => {
    const data = z
      .object({
        offerId: z.string().uuid(),
        surface: z.enum(["FEED", "STORY"]).default("FEED"),
        message: z.string().optional(),
        imageUrl: z.string().url().optional(),
        videoUrl: z.string().url().optional()
      })
      .parse(req.body ?? {});

    const offer = await prisma.offer.findUnique({
      where: { id: data.offerId },
      include: { product: true, marketplace: true }
    });
    if (!offer) throw new HttpError(404, "Oferta nao encontrada.");
    if (!offer.affiliateUrl) throw new HttpError(400, "Gere o link afiliado antes de publicar no Instagram.");

    const rendered = data.message
      ? { message: data.message }
      : await renderOfferMessage(offer.id, Channel.INSTAGRAM);
    const providerResponse = await publishInstagramContent({
      surface: data.surface,
      message: rendered.message,
      imageUrl: data.imageUrl ?? offer.product.imageUrl,
      videoUrl: data.videoUrl,
      affiliateUrl: offer.affiliateUrl
    });

    await prisma.publishLog.create({
      data: {
        offerId: offer.id,
        channel: Channel.INSTAGRAM,
        status: "SUCCESS",
        providerResponse: jsonInput(providerResponse)
      }
    });
    await prisma.offer.update({ where: { id: offer.id }, data: { status: "PUBLISHED" } });

    res.json(providerResponse);
  })
);

export default router;
