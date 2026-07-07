import { Prisma } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { recordAudit } from "../lib/audit.js";
import { asyncHandler, HttpError } from "../lib/http.js";
import { prisma } from "../lib/prisma.js";
import { slugify } from "../lib/slug.js";

const router = Router();

const blankableUrl = z.string().trim().url().optional().nullable().or(z.literal(""));

const productSchema = z.object({
  marketplaceId: z.string().uuid(),
  categoryId: z.string().uuid().optional().nullable(),
  brandId: z.string().uuid().optional().nullable(),
  externalId: z.string().trim().optional().nullable(),
  title: z.string().trim().min(2),
  description: z.string().trim().optional().nullable(),
  imageUrl: blankableUrl,
  productUrl: z.string().trim().url(),
  brand: z.string().trim().optional().nullable(),
  category: z.string().trim().optional().nullable(),
  rating: z.coerce.number().min(0).max(5).optional().nullable(),
  reviewCount: z.coerce.number().int().min(0).optional().nullable()
});

const productInclude = {
  marketplace: true,
  categoryRef: true,
  brandRef: true,
  _count: { select: { offers: true, generatedContents: true } }
} as const;

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const marketplaceId = typeof req.query.marketplaceId === "string" ? req.query.marketplaceId : undefined;
    const categoryId = typeof req.query.categoryId === "string" ? req.query.categoryId : undefined;
    const brandId = typeof req.query.brandId === "string" ? req.query.brandId : undefined;

    const where: Prisma.ProductWhereInput = {
      deletedAt: null,
      marketplaceId,
      categoryId,
      brandId,
      ...(q
        ? {
            OR: [
              { title: { contains: q, mode: "insensitive" } },
              { brand: { contains: q, mode: "insensitive" } },
              { category: { contains: q, mode: "insensitive" } },
              { externalId: { contains: q, mode: "insensitive" } }
            ]
          }
        : {})
    };

    const products = await prisma.product.findMany({
      where,
      include: productInclude,
      orderBy: { updatedAt: "desc" },
      take: 200
    });
    res.json(products);
  })
);

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const data = productSchema.parse(req.body);
    await assertMarketplace(data.marketplaceId);
    const taxonomy = await resolveTaxonomy(data);

    const product = await prisma.product.create({
      data: {
        marketplaceId: data.marketplaceId,
        categoryId: taxonomy.categoryId,
        brandId: taxonomy.brandId,
        externalId: cleanNullable(data.externalId),
        title: data.title,
        description: cleanNullable(data.description),
        imageUrl: cleanNullable(data.imageUrl),
        productUrl: data.productUrl,
        brand: taxonomy.brandName,
        category: taxonomy.categoryName,
        rating: data.rating,
        reviewCount: data.reviewCount
      },
      include: productInclude
    });

    await recordAudit(req, { entity: "Product", entityId: product.id, action: "create", after: product });
    res.status(201).json(product);
  })
);

router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const product = await prisma.product.findFirst({
      where: { id: req.params.id, deletedAt: null },
      include: {
        ...productInclude,
        offers: { orderBy: { createdAt: "desc" }, take: 25 },
        generatedContents: { where: { deletedAt: null }, orderBy: { createdAt: "desc" }, take: 25 }
      }
    });
    if (!product) throw new HttpError(404, "Produto nao encontrado.");
    res.json(product);
  })
);

router.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const data = productSchema.partial().parse(req.body);
    const before = await prisma.product.findFirst({ where: { id: req.params.id, deletedAt: null }, include: productInclude });
    if (!before) throw new HttpError(404, "Produto nao encontrado.");
    if (data.marketplaceId) await assertMarketplace(data.marketplaceId);

    const taxonomy = await resolveTaxonomy(data);
    const product = await prisma.product.update({
      where: { id: before.id },
      data: {
        marketplaceId: data.marketplaceId,
        categoryId: taxonomy.categoryId,
        brandId: taxonomy.brandId,
        externalId: cleanNullable(data.externalId),
        title: data.title,
        description: cleanNullable(data.description),
        imageUrl: cleanNullable(data.imageUrl),
        productUrl: data.productUrl,
        brand: taxonomy.brandName,
        category: taxonomy.categoryName,
        rating: data.rating,
        reviewCount: data.reviewCount
      },
      include: productInclude
    });

    await recordAudit(req, { entity: "Product", entityId: product.id, action: "update", before, after: product });
    res.json(product);
  })
);

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const before = await prisma.product.findFirst({ where: { id: req.params.id, deletedAt: null }, include: productInclude });
    if (!before) throw new HttpError(404, "Produto nao encontrado.");
    const product = await prisma.product.update({
      where: { id: before.id },
      data: { deletedAt: new Date() },
      include: productInclude
    });
    await recordAudit(req, { entity: "Product", entityId: product.id, action: "delete", before, after: product });
    res.status(204).end();
  })
);

async function assertMarketplace(marketplaceId: string) {
  const marketplace = await prisma.marketplace.findFirst({ where: { id: marketplaceId, deletedAt: null } });
  if (!marketplace) throw new HttpError(404, "Marketplace nao encontrado.");
}

async function resolveTaxonomy(data: {
  categoryId?: string | null;
  brandId?: string | null;
  category?: string | null;
  brand?: string | null;
}) {
  const categoryName = cleanNullable(data.category);
  const brandName = cleanNullable(data.brand);
  const categoryId =
    data.categoryId === undefined
      ? categoryName !== undefined
        ? categoryName
          ? (await ensureCategory(categoryName)).id
          : null
        : undefined
      : data.categoryId;
  const brandId =
    data.brandId === undefined
      ? brandName !== undefined
        ? brandName
          ? (await ensureBrand(brandName)).id
          : null
        : undefined
      : data.brandId;

  return {
    categoryId,
    brandId,
    categoryName,
    brandName
  };
}

async function ensureCategory(name: string) {
  const slug = slugify(name);
  if (!slug) throw new HttpError(400, "Categoria invalida.");
  return prisma.category.upsert({
    where: { slug },
    update: { name, isActive: true, deletedAt: null },
    create: { name, slug }
  });
}

async function ensureBrand(name: string) {
  const slug = slugify(name);
  if (!slug) throw new HttpError(400, "Marca invalida.");
  return prisma.brand.upsert({
    where: { slug },
    update: { name, isActive: true, deletedAt: null },
    create: { name, slug }
  });
}

function cleanNullable(value: string | null | undefined) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export default router;
