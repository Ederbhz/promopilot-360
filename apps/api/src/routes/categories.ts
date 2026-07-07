import { Prisma } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { recordAudit } from "../lib/audit.js";
import { asyncHandler, HttpError } from "../lib/http.js";
import { prisma } from "../lib/prisma.js";
import { slugify } from "../lib/slug.js";

const router = Router();

const categorySchema = z.object({
  name: z.string().trim().min(2),
  slug: z.string().trim().optional(),
  description: z.string().trim().optional().nullable(),
  isActive: z.boolean().default(true)
});

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const where: Prisma.CategoryWhereInput = {
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
    const categories = await prisma.category.findMany({
      where,
      include: { _count: { select: { products: true } } },
      orderBy: { name: "asc" }
    });
    res.json(categories);
  })
);

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const data = categorySchema.parse(req.body);
    const slug = normalizeSlug(data.slug || data.name);
    await assertAvailableSlug(slug);

    const category = await prisma.category.create({
      data: {
        name: data.name,
        slug,
        description: data.description,
        isActive: data.isActive
      }
    });

    await recordAudit(req, { entity: "Category", entityId: category.id, action: "create", after: category });
    res.status(201).json(category);
  })
);

router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const category = await prisma.category.findFirst({
      where: { id: req.params.id, deletedAt: null },
      include: { products: { where: { deletedAt: null }, take: 50, orderBy: { updatedAt: "desc" } } }
    });
    if (!category) throw new HttpError(404, "Categoria nao encontrada.");
    res.json(category);
  })
);

router.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const data = categorySchema.partial().parse(req.body);
    const before = await prisma.category.findFirst({ where: { id: req.params.id, deletedAt: null } });
    if (!before) throw new HttpError(404, "Categoria nao encontrada.");

    const slug = data.slug || data.name ? normalizeSlug(data.slug || data.name!) : undefined;
    if (slug && slug !== before.slug) await assertAvailableSlug(slug);

    const category = await prisma.category.update({
      where: { id: before.id },
      data: {
        name: data.name,
        slug,
        description: data.description,
        isActive: data.isActive
      }
    });

    await recordAudit(req, { entity: "Category", entityId: category.id, action: "update", before, after: category });
    res.json(category);
  })
);

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const before = await prisma.category.findFirst({ where: { id: req.params.id, deletedAt: null } });
    if (!before) throw new HttpError(404, "Categoria nao encontrada.");
    const category = await prisma.category.update({
      where: { id: before.id },
      data: { deletedAt: new Date(), isActive: false }
    });
    await recordAudit(req, { entity: "Category", entityId: category.id, action: "delete", before, after: category });
    res.status(204).end();
  })
);

function normalizeSlug(value: string) {
  const slug = slugify(value);
  if (!slug) throw new HttpError(400, "Slug da categoria invalido.");
  return slug;
}

async function assertAvailableSlug(slug: string) {
  const existing = await prisma.category.findUnique({ where: { slug } });
  if (existing) throw new HttpError(409, "Slug de categoria ja cadastrado.");
}

export default router;
