import { Router } from "express";
import { z } from "zod";
import { recordAudit } from "../lib/audit.js";
import { asyncHandler, HttpError } from "../lib/http.js";
import { prisma } from "../lib/prisma.js";

const router = Router();

const couponSchema = z.object({
  marketplaceId: z.string().uuid(),
  codigo: z.string().trim().min(2).max(100),
  titulo: z.string().trim().optional().nullable(),
  descricao: z.string().trim().optional().nullable(),
  percentualDesconto: z.coerce.number().min(0).max(100).optional().nullable(),
  valorDesconto: z.coerce.number().min(0).optional().nullable(),
  valorMinimo: z.coerce.number().min(0).optional().nullable(),
  dataInicio: z.coerce.date().optional().nullable(),
  dataFim: z.coerce.date().optional().nullable(),
  status: z.boolean().default(true),
  origem: z.string().trim().optional().nullable(),
  urlOrigem: z.string().trim().url().optional().nullable()
});

router.get(
  "/",
  asyncHandler(async (_req, res) => {
    const coupons = await prisma.coupon.findMany({
      where: { deletedAt: null },
      include: {
        marketplace: true,
        products: { include: { product: true } },
        categories: { include: { category: true } }
      },
      orderBy: [{ status: "desc" }, { dataFim: "asc" }, { createdAt: "desc" }]
    });
    res.json(coupons);
  })
);

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const data = couponSchema.parse(req.body);
    const coupon = await prisma.coupon.create({ data, include: { marketplace: true } });
    await recordAudit(req, { entity: "Coupon", entityId: coupon.id, action: "create", after: coupon });
    res.status(201).json(coupon);
  })
);

router.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const before = await prisma.coupon.findFirst({ where: { id: req.params.id, deletedAt: null } });
    if (!before) throw new HttpError(404, "Cupom nao encontrado.");
    const data = couponSchema.partial().parse(req.body);
    const coupon = await prisma.coupon.update({ where: { id: before.id }, data, include: { marketplace: true } });
    await recordAudit(req, { entity: "Coupon", entityId: coupon.id, action: "update", before, after: coupon });
    res.json(coupon);
  })
);

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const before = await prisma.coupon.findFirst({ where: { id: req.params.id, deletedAt: null } });
    if (!before) throw new HttpError(404, "Cupom nao encontrado.");
    const coupon = await prisma.coupon.update({ where: { id: before.id }, data: { deletedAt: new Date(), status: false } });
    await recordAudit(req, { entity: "Coupon", entityId: coupon.id, action: "delete", before, after: coupon });
    res.status(204).end();
  })
);

router.post(
  "/:id/products",
  asyncHandler(async (req, res) => {
    const data = z.object({ productIds: z.array(z.string().uuid()).default([]) }).parse(req.body ?? {});
    await ensureCoupon(req.params.id!);
    await prisma.couponProduct.deleteMany({ where: { couponId: req.params.id } });
    if (data.productIds.length) {
      await prisma.couponProduct.createMany({
        data: [...new Set(data.productIds)].map((productId) => ({ couponId: req.params.id!, productId })),
        skipDuplicates: true
      });
    }
    res.json(await getCoupon(req.params.id!));
  })
);

router.post(
  "/:id/categories",
  asyncHandler(async (req, res) => {
    const data = z.object({ categoryIds: z.array(z.string().uuid()).default([]) }).parse(req.body ?? {});
    await ensureCoupon(req.params.id!);
    await prisma.couponCategory.deleteMany({ where: { couponId: req.params.id } });
    if (data.categoryIds.length) {
      await prisma.couponCategory.createMany({
        data: [...new Set(data.categoryIds)].map((categoryId) => ({ couponId: req.params.id!, categoryId })),
        skipDuplicates: true
      });
    }
    res.json(await getCoupon(req.params.id!));
  })
);

async function ensureCoupon(id: string) {
  const coupon = await prisma.coupon.findFirst({ where: { id, deletedAt: null } });
  if (!coupon) throw new HttpError(404, "Cupom nao encontrado.");
  return coupon;
}

async function getCoupon(id: string) {
  return prisma.coupon.findUnique({
    where: { id },
    include: {
      marketplace: true,
      products: { include: { product: true } },
      categories: { include: { category: true } }
    }
  });
}

export default router;
