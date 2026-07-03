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
  config: z.record(z.unknown()).optional(),
  whatsappGroupIds: z.array(z.string().uuid()).optional()
});

router.get(
  "/",
  asyncHandler(async (_req, res) => {
    const campaigns = await prisma.campaign.findMany({
      include: {
        marketplace: true,
        template: true,
        whatsappGroups: { include: { group: true } },
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
    await setCampaignWhatsAppGroups(campaign.id, data.whatsappGroupIds ?? []);
    const created = await findCampaign(campaign.id);
    res.status(201).json(created);
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
        whatsappGroups: { include: { group: true } },
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
    const campaignId = req.params.id!;
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
    await prisma.campaign.update({ where: { id: campaignId }, data: updateData });
    if (data.whatsappGroupIds) await setCampaignWhatsAppGroups(campaignId, data.whatsappGroupIds);
    const campaign = await findCampaign(campaignId);
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
  "/:id/pause",
  asyncHandler(async (req, res) => {
    const campaign = await prisma.campaign.update({
      where: { id: req.params.id },
      data: { status: CampaignStatus.PAUSED }
    });
    res.json(campaign);
  })
);

router.post(
  "/:id/resume",
  asyncHandler(async (req, res) => {
    const campaign = await prisma.campaign.update({
      where: { id: req.params.id },
      data: { status: CampaignStatus.ACTIVE }
    });
    res.json(campaign);
  })
);

router.post(
  "/:id/cancel",
  asyncHandler(async (req, res) => {
    await prisma.scheduledPost.updateMany({
      where: {
        campaignId: req.params.id,
        status: { in: [ScheduledPostStatus.SCHEDULED, ScheduledPostStatus.READY_TO_SEND] }
      },
      data: { status: ScheduledPostStatus.CANCELED }
    });
    const campaign = await prisma.campaign.update({
      where: { id: req.params.id },
      data: { status: CampaignStatus.ENDED }
    });
    res.json(campaign);
  })
);

router.get(
  "/:id/logs",
  asyncHandler(async (req, res) => {
    const logs = await prisma.messageSendLog.findMany({
      where: { campaignId: req.params.id },
      include: {
        whatsappGroup: true,
        whatsappConnection: true,
        scheduledPost: { include: { offer: { include: { product: true } } } }
      },
      orderBy: { createdAt: "desc" },
      take: 200
    });
    res.json(logs);
  })
);

router.post(
  "/:id/preview-next-posts",
  asyncHandler(async (req, res) => {
    const campaign = await prisma.campaign.findUnique({
      where: { id: req.params.id },
      include: { whatsappGroups: true }
    });
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

    const groupIds = getCampaignWhatsAppGroupIds(campaign);
    const schedule = buildSchedule(
      new Date(),
      campaign.intervalMinutes,
      Math.max(offers.length * groupIds.length, 1),
      campaign.startTime,
      campaign.endTime
    );
    const scheduled = [];
    let scheduleIndex = 0;
    for (const [index, offer] of offers.entries()) {
      const rendered = await renderOfferMessage(offer.id, campaign.channel, campaign.templateId ?? undefined);
      for (const groupId of groupIds) {
        scheduled.push(
          await prisma.scheduledPost.create({
            data: {
              campaignId: campaign.id,
              offerId: offer.id,
              whatsappGroupId: groupId,
              channel: campaign.channel,
              message: rendered.message,
              scheduledAt: schedule[scheduleIndex++]!,
              status: shouldHoldForApproval(campaign, groupId)
                ? ScheduledPostStatus.READY_TO_SEND
                : ScheduledPostStatus.SCHEDULED
            }
          })
        );
      }
      await prisma.offer.update({
        where: { id: offer.id },
        data: { status: OfferStatus.SCHEDULED }
      });
    }

    res.status(201).json({ count: scheduled.length, scheduled });
  })
);

router.post(
  "/:id/add-offer",
  asyncHandler(async (req, res) => {
    const data = z.object({ offerId: z.string().uuid() }).parse(req.body ?? {});
    const campaign = await prisma.campaign.findUnique({
      where: { id: req.params.id },
      include: { whatsappGroups: true }
    });
    if (!campaign) throw new HttpError(404, "Campanha nao encontrada.");

    const offer = await prisma.offer.findUnique({
      where: { id: data.offerId },
      include: { product: true, marketplace: true }
    });
    if (!offer) throw new HttpError(404, "Oferta nao encontrada.");
    if (campaign.marketplaceId && campaign.marketplaceId !== offer.marketplaceId) {
      throw new HttpError(400, "Esta oferta nao pertence ao marketplace configurado na campanha.");
    }
    if (!offer.affiliateUrl) {
      throw new HttpError(400, "Gere ou informe o link afiliado antes de incluir a oferta na campanha.");
    }

    const rendered = await renderOfferMessage(offer.id, campaign.channel, campaign.templateId ?? undefined);
    const scheduledAt = await nextCampaignSlot(campaign.id, campaign.intervalMinutes, campaign.startTime, campaign.endTime);
    const scheduled = [];
    const groupIds = getCampaignWhatsAppGroupIds(campaign);
    for (const [groupIndex, groupId] of groupIds.entries()) {
      const targetScheduledAt: Date =
        groupIndex === 0
          ? scheduledAt
          : await nextCampaignSlot(campaign.id, campaign.intervalMinutes, campaign.startTime, campaign.endTime);
      scheduled.push(
        await prisma.scheduledPost.create({
          data: {
            campaignId: campaign.id,
            offerId: offer.id,
            whatsappGroupId: groupId,
            channel: campaign.channel,
            message: rendered.message,
            scheduledAt: targetScheduledAt,
            status: shouldHoldForApproval(campaign, groupId)
              ? ScheduledPostStatus.READY_TO_SEND
              : ScheduledPostStatus.SCHEDULED
          },
          include: {
            campaign: true,
            whatsappGroup: true,
            offer: { include: { product: true, marketplace: true } }
          }
        })
      );
    }
    const updatedOffer = await prisma.offer.update({
      where: { id: offer.id },
      data: { status: OfferStatus.SCHEDULED },
      include: { product: true, marketplace: true }
    });

    res.status(201).json({ scheduled, offer: updatedOffer });
  })
);

async function findCampaign(id: string) {
  return prisma.campaign.findUnique({
    where: { id },
    include: {
      marketplace: true,
      template: true,
      whatsappGroups: { include: { group: true } },
      _count: { select: { scheduledPosts: true } }
    }
  });
}

async function setCampaignWhatsAppGroups(campaignId: string, groupIds: string[]) {
  await prisma.campaignWhatsAppGroup.deleteMany({ where: { campaignId } });
  if (!groupIds.length) return;
  await prisma.campaignWhatsAppGroup.createMany({
    data: [...new Set(groupIds)].map((groupId) => ({ campaignId, groupId })),
    skipDuplicates: true
  });
}

function getCampaignWhatsAppGroupIds(campaign: { channel: Channel; whatsappGroups?: Array<{ groupId: string }> }) {
  if (campaign.channel !== Channel.WHATSAPP) return [null];
  const groupIds = campaign.whatsappGroups?.map((item) => item.groupId) ?? [];
  return groupIds.length ? groupIds : [null];
}

function shouldHoldForApproval(campaign: { requireManualApproval: boolean; channel: Channel }, groupId: string | null) {
  return campaign.requireManualApproval || (campaign.channel === Channel.WHATSAPP && !groupId);
}

function buildSchedule(start: Date, intervalMinutes: number, limit: number, startTime?: string | null, endTime?: string | null) {
  const schedule: Date[] = [];
  let cursor = nextAllowedSlot(start, startTime, endTime);
  for (let index = 0; index < limit; index += 1) {
    schedule.push(new Date(cursor));
    cursor = new Date(cursor.getTime() + intervalMinutes * 60_000);
    cursor = nextAllowedSlot(cursor, startTime, endTime);
  }
  return schedule;
}

function nextAllowedSlot(date: Date, startTime?: string | null, endTime?: string | null) {
  if (!startTime || !endTime) return new Date(date);
  const startMinutes = parseTime(startTime);
  const endMinutes = parseTime(endTime);
  if (startMinutes === undefined || endMinutes === undefined || endMinutes <= startMinutes) return new Date(date);

  const result = new Date(date);
  const currentMinutes = result.getHours() * 60 + result.getMinutes();
  if (currentMinutes < startMinutes) {
    result.setHours(Math.floor(startMinutes / 60), startMinutes % 60, 0, 0);
    return result;
  }
  if (currentMinutes > endMinutes) {
    result.setDate(result.getDate() + 1);
    result.setHours(Math.floor(startMinutes / 60), startMinutes % 60, 0, 0);
  }
  return result;
}

function parseTime(value: string) {
  const match = value.match(/^(\d{2}):(\d{2})$/);
  if (!match) return undefined;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return undefined;
  return hours * 60 + minutes;
}

async function nextCampaignSlot(
  campaignId: string,
  intervalMinutes: number,
  startTime?: string | null,
  endTime?: string | null
) {
  const lastPost = await prisma.scheduledPost.findFirst({
    where: {
      campaignId,
      status: { in: [ScheduledPostStatus.SCHEDULED, ScheduledPostStatus.READY_TO_SEND] }
    },
    orderBy: { scheduledAt: "desc" }
  });
  const base = lastPost && lastPost.scheduledAt > new Date() ? lastPost.scheduledAt : new Date();
  const next = new Date(base);
  if (lastPost) next.setMinutes(next.getMinutes() + intervalMinutes);
  return nextAllowedSlot(next, startTime, endTime);
}

export default router;
