import { Router } from "express";
import { z } from "zod";
import { recordAudit } from "../lib/audit.js";
import { asyncHandler, HttpError } from "../lib/http.js";
import { prisma } from "../lib/prisma.js";
import { jsonInput } from "../lib/sanitize.js";
import { generateSeoPage } from "../services/intelligence.js";

const router = Router();

const seoUpdateSchema = z.object({
  tipo: z.string().trim().optional(),
  slug: z.string().trim().optional(),
  tituloSeo: z.string().trim().optional(),
  metaDescription: z.string().trim().optional().nullable(),
  h1: z.string().trim().optional().nullable(),
  conteudo: z.string().trim().optional().nullable(),
  faq: z.unknown().optional(),
  schemaJson: z.unknown().optional(),
  palavraChavePrincipal: z.string().trim().optional().nullable(),
  palavrasChaveSecundarias: z.array(z.string()).optional(),
  status: z.string().trim().optional()
});

router.get(
  "/pages",
  asyncHandler(async (_req, res) => {
    const pages = await prisma.seoPage.findMany({
      where: { deletedAt: null },
      include: { product: true, category: true, marketplace: true },
      orderBy: { createdAt: "desc" },
      take: 200
    });
    res.json(pages);
  })
);

router.post(
  "/pages/generate",
  asyncHandler(async (req, res) => {
    const data = z
      .object({
        productId: z.string().uuid().optional(),
        categoryId: z.string().uuid().optional(),
        marketplaceId: z.string().uuid().optional(),
        tipo: z.string().trim().default("review"),
        palavraChavePrincipal: z.string().trim().optional()
      })
      .parse(req.body ?? {});
    const page = await generateSeoPage({
      productId: data.productId,
      categoryId: data.categoryId,
      marketplaceId: data.marketplaceId,
      tipo: data.tipo,
      keyword: data.palavraChavePrincipal
    });
    await recordAudit(req, { entity: "SeoPage", entityId: page.id, action: "create", after: page });
    res.status(201).json(page);
  })
);

router.put(
  "/pages/:id",
  asyncHandler(async (req, res) => {
    const before = await prisma.seoPage.findFirst({ where: { id: req.params.id, deletedAt: null } });
    if (!before) throw new HttpError(404, "Pagina SEO nao encontrada.");
    const data = seoUpdateSchema.parse(req.body);
    const page = await prisma.seoPage.update({
      where: { id: before.id },
      data: {
        ...data,
        faq: data.faq === undefined ? undefined : jsonInput(data.faq),
        schemaJson: data.schemaJson === undefined ? undefined : jsonInput(data.schemaJson)
      }
    });
    await recordAudit(req, { entity: "SeoPage", entityId: page.id, action: "update", before, after: page });
    res.json(page);
  })
);

router.put(
  "/pages/:id/publish",
  asyncHandler(async (req, res) => {
    const before = await prisma.seoPage.findFirst({ where: { id: req.params.id, deletedAt: null } });
    if (!before) throw new HttpError(404, "Pagina SEO nao encontrada.");
    const page = await prisma.seoPage.update({
      where: { id: before.id },
      data: { status: "publicado", publishedAt: new Date() }
    });
    await recordAudit(req, { entity: "SeoPage", entityId: page.id, action: "publish", before, after: page });
    res.json(page);
  })
);

router.delete(
  "/pages/:id",
  asyncHandler(async (req, res) => {
    const before = await prisma.seoPage.findFirst({ where: { id: req.params.id, deletedAt: null } });
    if (!before) throw new HttpError(404, "Pagina SEO nao encontrada.");
    const page = await prisma.seoPage.update({
      where: { id: before.id },
      data: { deletedAt: new Date(), status: "arquivado" }
    });
    await recordAudit(req, { entity: "SeoPage", entityId: page.id, action: "delete", before, after: page });
    res.status(204).end();
  })
);

export default router;
