import { CampaignStatus, Channel, OfferStatus, Prisma, ScheduledPostStatus } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { asyncHandler, HttpError } from "../lib/http.js";
import { prisma } from "../lib/prisma.js";
import { jsonInput } from "../lib/sanitize.js";
import { renderOfferMessage } from "../services/message-service.js";

const router = Router();

const campaignSchema = z.object({
  name: z.string().min(2),
  marketplaceId: z.string().uuid().optional().nullable(),
  templateId: z.string().optional().nullable(),
  channel: z.nativeEnum(Channel),
  status: z.nativeEnum(CampaignStatus).default(CampaignStatus.PAUSED),
  startTime: z.string().regex(/^\d{2}:\d{2}$/).optional().nullable(),
  endTime: z.string().regex(/^\d{2}:\d{2}$/).optional().nullable(),
  intervalMinutes: z.coerce.number().int().min(5).default(30),
  dailyLimit: z.coerce.number().int().min(1).max(200).default(30),
  requireManualApproval: z.boolean().default(true),
  allowRepost: z.boolean().default(false),
  minHoursToRepost: z.coerce.number().int().min(1).default(72),
  config: z.record(z.unknown()).optional()
});

router.get(
  "/",
  asyncHandler(async (_req, res) => {
    const campaigns = await prisma.campaign.findMany({
      include: {
        marketplace: true,
        template: true,
        _count: { select: { scheduledPosts: true } }
      },
      orderBy: { createdAt: "desc" }
    });
    res.json(campaigns);
  })
);

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const data = campaignSchema.parse(req.body);
    const createData: Prisma.CampaignUncheckedCreateInput = {
      name: data.name,
      marketplaceId: data.marketplaceId ?? null,
      templateId: data.templateId ?? null,
      channel: data.channel,
      status: data.status,
      startTime: data.startTime ?? null,
      endTime: data.endTime ?? null,
      intervalMinutes: data.intervalMinutes,
      dailyLimit: data.dailyLimit,
      requireManualApproval: data.requireManualApproval,
      allowRepost: data.allowRepost,
      minHoursToRepost: data.minHoursToRepost,
      config: jsonInput(data.config)
    };
    const campaign = await prisma.campaign.create({ data: createData });
    res.status(201).json(campaign);
  })
);

router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const campaign = await prisma.campaign.findUnique({
      where: { id: req.params.id },
      include: {
        marketplace: true,
        template: true,
        scheduledPosts: {
          include: { offer: { include: { product: true, marketplace: true } } },
          orderBy: { scheduledAt: "desc" },
          take: 50
        }
      }
    });
    if (!campaign) throw new HttpError(404, "Campanha nao encontrada.");
    res.json(campaign);
  })
);

router.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const data = campaignSchema.partial().parse(req.body);
    const updateData: Prisma.CampaignUncheckedUpdateInput = {
      name: data.name,
      marketplaceId: data.marketplaceId,
      templateId: data.templateId,
      channel: data.channel,
      status: data.status,
      startTime: data.startTime,
      endTime: data.endTime,
      intervalMinutes: data.intervalMinutes,
      dailyLimit: data.dailyLimit,
      requireManualApproval: data.requireManualApproval,
      allowRepost: data.allowRepost,
      minHoursToRepost: data.minHoursToRepost,
      config: jsonInput(data.config)
    };
    const campaign = await prisma.campaign.update({ where: { id: req.params.id }, data: updateData });
    res.json(campaign);
  })
);

router.patch(
  "/:id/status",
  asyncHandler(async (req, res) => {
    const data = z.object({ status: z.nativeEnum(CampaignStatus) }).parse(req.body);
    const campaign = await prisma.campaign.update({ where: { id: req.params.id }, data });
    res.json(campaign);
  })
);

router.post(
  "/:id/preview-next-posts",
  asyncHandler(async (req, res) => {
    const campaign = await prisma.campaign.findUnique({ where: { id: req.params.id } });
    if (!campaign) throw new HttpError(404, "Campanha nao encontrada.");
    const limit = z.coerce.number().int().min(1).max(20).default(5).parse(req.body?.limit ?? 5);
    res.json({ schedule: buildSchedule(new Date(), campaign.intervalMinutes, limit) });
  })
);

router.post(
  "/:id/fill-queue",
  asyncHandler(async (req, res) => {
    const campaign = await prisma.campaign.findUnique({ where: { id: req.params.id } });
    if (!campaign) throw new HttpError(404, "Campanha nao encontrada.");

    const limit = z.coerce.number().int().min(1).max(campaign.dailyLimit).default(10).parse(req.body?.limit ?? 10);
    const offers = await prisma.offer.findMany({
      where: {
        marketplaceId: campaign.marketplaceId ?? undefined,
        status: { in: [OfferStatus.VALID, OfferStatus.AFFILIATE_LINK_MISSING] }
      },
      include: { product: true, marketplace: true },
      orderBy: [{ score: "desc" }, { createdAt: "desc" }],
      take: limit
    });

    const schedule = buildSchedule(new Date(), campaign.intervalMinutes, offers.length);
    const scheduled = [];
    for (const [index, offer] of offers.entries()) {
      const rendered = await renderOfferMessage(offer.id, campaign.channel, campaign.templateId ?? undefined);
      scheduled.push(
        await prisma.scheduledPost.create({
          data: {
            campaignId: campaign.id,
            offerId: offer.id,
            channel: campaign.channel,
            message: rendered.message,
            scheduledAt: schedule[index]!,
            status:
              campaign.requireManualApproval || campaign.channel === Channel.WHATSAPP
                ? ScheduledPostStatus.READY_TO_SEND
                : ScheduledPostStatus.SCHEDULED
          }
        })
      );
      await prisma.offer.update({
        where: { id: offer.id },
        data: { status: OfferStatus.SCHEDULED }
      });
    }

    res.status(201).json({ count: scheduled.length, scheduled });
  })
);

function buildSchedule(start: Date, intervalMinutes: number, limit: number) {
  return Array.from({ length: limit }, (_item, index) => {
    const date = new Date(start);
    date.setMinutes(date.getMinutes() + intervalMinutes * index);
    return date;
  });
}

export default router;
