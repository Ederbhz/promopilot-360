import { Prisma } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { recordAudit } from "../lib/audit.js";
import { asyncHandler, HttpError } from "../lib/http.js";
import { prisma } from "../lib/prisma.js";
import { slugify } from "../lib/slug.js";

const router = Router();

const brandSchema = z.object({
  name: z.string().trim().min(2),
  slug: z.string().trim().optional(),
  description: z.string().trim().optional().nullable(),
  isActive: z.boolean().default(true)
});

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const where: Prisma.BrandWhereInput = {
      deletedAt: null,
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { slug: { contains: slugify(q), mode: "insensitive" } }
            ]
          }
        : {})
    };
    const brands = await prisma.brand.findMany({
      where,
      include: { _count: { select: { products: true } } },
      orderBy: { name: "asc" }
    });
    res.json(brands);
  })
);

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const data = brandSchema.parse(req.body);
    const slug = normalizeSlug(data.slug || data.name);
    await assertAvailableSlug(slug);

    const brand = await prisma.brand.create({
      data: {
        name: data.name,
        slug,
        description: data.description,
        isActive: data.isActive
      }
    });

    await recordAudit(req, { entity: "Brand", entityId: brand.id, action: "create", after: brand });
    res.status(201).json(brand);
  })
);

router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const brand = await prisma.brand.findFirst({
      where: { id: req.params.id, deletedAt: null },
      include: { products: { where: { deletedAt: null }, take: 50, orderBy: { updatedAt: "desc" } } }
    });
    if (!brand) throw new HttpError(404, "Marca nao encontrada.");
    res.json(brand);
  })
);

router.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const data = brandSchema.partial().parse(req.body);
    const before = await prisma.brand.findFirst({ where: { id: req.params.id, deletedAt: null } });
    if (!before) throw new HttpError(404, "Marca nao encontrada.");

    const slug = data.slug || data.name ? normalizeSlug(data.slug || data.name!) : undefined;
    if (slug && slug !== before.slug) await assertAvailableSlug(slug);

    const brand = await prisma.brand.update({
      where: { id: before.id },
      data: {
        name: data.name,
        slug,
        description: data.description,
        isActive: data.isActive
      }
    });

    await recordAudit(req, { entity: "Brand", entityId: brand.id, action: "update", before, after: brand });
    res.json(brand);
  })
);

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const before = await prisma.brand.findFirst({ where: { id: req.params.id, deletedAt: null } });
    if (!before) throw new HttpError(404, "Marca nao encontrada.");
    const brand = await prisma.brand.update({
      where: { id: before.id },
      data: { deletedAt: new Date(), isActive: false }
    });
    await recordAudit(req, { entity: "Brand", entityId: brand.id, action: "delete", before, after: brand });
    res.status(204).end();
  })
);

function normalizeSlug(value: string) {
  const slug = slugify(value);
  if (!slug) throw new HttpError(400, "Slug da marca invalido.");
  return slug;
}

async function assertAvailableSlug(slug: string) {
  const existing = await prisma.brand.findUnique({ where: { slug } });
  if (existing) throw new HttpError(409, "Slug de marca ja cadastrado.");
}

export default router;
