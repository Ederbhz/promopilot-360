import { Channel } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { renderMessageTemplate } from "@promopilot/message-templates";
import { asyncHandler, HttpError } from "../lib/http.js";
import { prisma } from "../lib/prisma.js";

const router = Router();

const templateSchema = z.object({
  name: z.string().min(2),
  channel: z.nativeEnum(Channel),
  content: z.string().min(5),
  isDefault: z.boolean().default(false)
});

router.get(
  "/",
  asyncHandler(async (_req, res) => {
    const templates = await prisma.messageTemplate.findMany({
      orderBy: [{ channel: "asc" }, { isDefault: "desc" }, { name: "asc" }]
    });
    res.json(templates);
  })
);

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const data = templateSchema.parse(req.body);
    if (data.isDefault) {
      await prisma.messageTemplate.updateMany({
        where: { channel: data.channel },
        data: { isDefault: false }
      });
    }
    const template = await prisma.messageTemplate.create({ data });
    res.status(201).json(template);
  })
);

router.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const data = templateSchema.partial().parse(req.body);
    if (data.isDefault && data.channel) {
      await prisma.messageTemplate.updateMany({
        where: { channel: data.channel },
        data: { isDefault: false }
      });
    }
    const template = await prisma.messageTemplate.update({ where: { id: req.params.id }, data });
    res.json(template);
  })
);

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    await prisma.messageTemplate.delete({ where: { id: req.params.id } });
    res.status(204).end();
  })
);

router.post(
  "/:id/preview",
  asyncHandler(async (req, res) => {
    const template = await prisma.messageTemplate.findUnique({ where: { id: req.params.id } });
    if (!template) throw new HttpError(404, "Template nao encontrado.");
    const variables = z.record(z.string()).default({}).parse(req.body?.variables ?? {});
    res.json({
      message: renderMessageTemplate(template.content, {
        titulo: "Tenis de corrida com amortecimento",
        preco_atual: "R$ 149,90",
        preco_anterior: "R$ 249,90",
        desconto_percentual: "40%",
        cupom: "PROMO10",
        marketplace: "Shopee",
        avaliacao: "4.8 / 5",
        frete: "Gratis",
        link_afiliado: "https://exemplo.com/oferta",
        ...variables
      })
    });
  })
);

export default router;
