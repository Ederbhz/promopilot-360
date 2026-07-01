import { Router } from "express";
import { z } from "zod";
import { encryptJson } from "../lib/crypto.js";
import { asyncHandler, HttpError } from "../lib/http.js";
import { prisma } from "../lib/prisma.js";
import { jsonInput, sanitizeAffiliateAccount } from "../lib/sanitize.js";
import { connectors } from "../services/connectors.js";

const router = Router();

const accountSchema = z.object({
  marketplaceId: z.string().uuid(),
  name: z.string().min(2),
  accountIdentifier: z.string().optional().nullable(),
  affiliateTag: z.string().optional().nullable(),
  credentials: z.record(z.unknown()).optional(),
  config: z.record(z.unknown()).optional(),
  isActive: z.boolean().default(true)
});

router.get(
  "/",
  asyncHandler(async (_req, res) => {
    const accounts = await prisma.affiliateAccount.findMany({
      include: { marketplace: true },
      orderBy: { createdAt: "desc" }
    });
    res.json(accounts.map(sanitizeAffiliateAccount));
  })
);

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const data = accountSchema.parse(req.body);
    const account = await prisma.affiliateAccount.create({
      data: {
        marketplaceId: data.marketplaceId,
        name: data.name,
        accountIdentifier: data.accountIdentifier,
        affiliateTag: data.affiliateTag,
        encryptedCredentials: data.credentials ? jsonInput(encryptJson(data.credentials)) : undefined,
        config: jsonInput(data.config),
        isActive: data.isActive
      },
      include: { marketplace: true }
    });
    res.status(201).json(sanitizeAffiliateAccount(account));
  })
);

router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const account = await prisma.affiliateAccount.findUnique({
      where: { id: req.params.id },
      include: { marketplace: true }
    });
    if (!account) throw new HttpError(404, "Conta de afiliado nao encontrada.");
    res.json(sanitizeAffiliateAccount(account));
  })
);

router.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const data = accountSchema.partial().parse(req.body);
    const account = await prisma.affiliateAccount.update({
      where: { id: req.params.id },
      data: {
        marketplaceId: data.marketplaceId,
        name: data.name,
        accountIdentifier: data.accountIdentifier,
        affiliateTag: data.affiliateTag,
        encryptedCredentials: data.credentials ? jsonInput(encryptJson(data.credentials)) : undefined,
        config: jsonInput(data.config),
        isActive: data.isActive
      },
      include: { marketplace: true }
    });
    res.json(sanitizeAffiliateAccount(account));
  })
);

router.post(
  "/:id/test",
  asyncHandler(async (req, res) => {
    const account = await prisma.affiliateAccount.findUnique({
      where: { id: req.params.id },
      include: { marketplace: true }
    });
    if (!account) throw new HttpError(404, "Conta de afiliado nao encontrada.");
    const health = await connectors[account.marketplace.key].healthCheck();
    await prisma.integrationLog.create({
      data: {
        marketplaceId: account.marketplaceId,
        operation: "affiliate_account.test",
        status: health.ok ? "SUCCESS" : "WARNING",
        responsePayload: jsonInput(health)
      }
    });
    res.json(health);
  })
);

export default router;
