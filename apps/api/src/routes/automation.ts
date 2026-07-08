import { Channel } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { recordAudit } from "../lib/audit.js";
import { asyncHandler, HttpError } from "../lib/http.js";
import { prisma } from "../lib/prisma.js";
import {
  buildNewsletterDraft,
  createPublicationSchedule,
  generateCreativeAsset,
  getAutomationDashboard,
  processDuePublicationSchedules,
  publishPublicationSchedule,
  retryFailedPublicationSchedules
} from "../services/automation.js";

const router = Router();

router.get(
  "/dashboard",
  asyncHandler(async (_req, res) => {
    res.json(await getAutomationDashboard());
  })
);

router.get(
  "/publication-schedule",
  asyncHandler(async (req, res) => {
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const schedules = await prisma.publicationSchedule.findMany({
      where: { status },
      include: {
        product: { include: { marketplace: true } },
        offer: { include: { product: true, marketplace: true } },
        creativeAsset: true,
        scheduledPost: true
      },
      orderBy: [{ scheduledAt: "asc" }, { createdAt: "desc" }],
      take: 200
    });
    res.json(schedules);
  })
);

router.post(
  "/publication-schedule",
  asyncHandler(async (req, res) => {
    const data = z
      .object({
        productId: z.string().uuid().optional(),
        offerId: z.string().uuid().optional(),
        creativeAssetId: z.string().uuid().optional(),
        channel: z.nativeEnum(Channel),
        scheduledAt: z.coerce.date(),
        message: z.string().trim().optional()
      })
      .superRefine((value, ctx) => {
        if (!value.productId && !value.offerId) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Informe produto ou oferta para agendar.",
            path: ["productId"]
          });
        }
      })
      .parse(req.body ?? {});
    const schedule = await createPublicationSchedule(data);
    await recordAudit(req, { entity: "PublicationSchedule", entityId: schedule.id, action: "create", after: schedule });
    res.status(201).json(schedule);
  })
);

router.post(
  "/publication-schedule/:id/publish-now",
  asyncHandler(async (req, res) => {
    const schedule = await publishPublicationSchedule(req.params.id!, { force: true });
    await recordAudit(req, { entity: "PublicationSchedule", entityId: schedule.id, action: "publish", after: schedule });
    res.json(schedule);
  })
);

router.post(
  "/publication-schedule/:id/cancel",
  asyncHandler(async (req, res) => {
    const before = await prisma.publicationSchedule.findUnique({ where: { id: req.params.id } });
    if (!before) throw new HttpError(404, "Agendamento V3 nao encontrado.");
    const schedule = await prisma.publicationSchedule.update({
      where: { id: before.id },
      data: { status: "CANCELED" }
    });
    if (before.scheduledPostId) {
      await prisma.scheduledPost.update({
        where: { id: before.scheduledPostId },
        data: { status: "CANCELED" }
      });
    }
    await recordAudit(req, { entity: "PublicationSchedule", entityId: schedule.id, action: "cancel", before, after: schedule });
    res.json(schedule);
  })
);

router.get(
  "/creative-assets",
  asyncHandler(async (_req, res) => {
    const assets = await prisma.creativeAsset.findMany({
      include: { product: { include: { marketplace: true } } },
      orderBy: { createdAt: "desc" },
      take: 200
    });
    res.json(assets);
  })
);

router.post(
  "/creative-assets/generate",
  asyncHandler(async (req, res) => {
    const data = z
      .object({
        productId: z.string().uuid(),
        type: z.string().trim().default("IMAGE"),
        channel: z.string().trim().optional(),
        prompt: z.string().trim().optional(),
        fileUrl: z.string().trim().url().optional()
      })
      .parse(req.body ?? {});
    const asset = await generateCreativeAsset(data);
    await recordAudit(req, { entity: "CreativeAsset", entityId: asset.id, action: "create", after: asset });
    res.status(201).json(asset);
  })
);

router.put(
  "/creative-assets/:id/approve",
  asyncHandler(async (req, res) => {
    const before = await prisma.creativeAsset.findUnique({ where: { id: req.params.id } });
    if (!before) throw new HttpError(404, "Criativo nao encontrado.");
    const asset = await prisma.creativeAsset.update({
      where: { id: before.id },
      data: { status: "APPROVED" },
      include: { product: { include: { marketplace: true } } }
    });
    await recordAudit(req, { entity: "CreativeAsset", entityId: asset.id, action: "approve", before, after: asset });
    res.json(asset);
  })
);

router.post(
  "/jobs/publish-queue",
  asyncHandler(async (_req, res) => {
    res.json({ processed: await processDuePublicationSchedules() });
  })
);

router.post(
  "/jobs/retry-publication",
  asyncHandler(async (_req, res) => {
    res.json({ retried: await retryFailedPublicationSchedules() });
  })
);

router.post(
  "/newsletter/send",
  asyncHandler(async (req, res) => {
    const data = z.object({ limit: z.coerce.number().int().min(1).max(30).default(8) }).parse(req.body ?? {});
    const newsletter = await buildNewsletterDraft(data.limit);
    await recordAudit(req, {
      entity: "Newsletter",
      action: "draft",
      after: { subject: newsletter.subject, offers: newsletter.offers.length }
    });
    res.json(newsletter);
  })
);

export default router;
