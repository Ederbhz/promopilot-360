import { CampaignStatus, OfferStatus, ScheduledPostStatus } from "@prisma/client";
import { Router } from "express";
import { asyncHandler } from "../lib/http.js";
import { prisma } from "../lib/prisma.js";

const router = Router();

router.get(
  "/dashboard",
  asyncHandler(async (_req, res) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [
      offersToday,
      scheduledPosts,
      publishedPosts,
      clicks,
      activeCampaigns,
      integrationErrors,
      topOffers,
      marketplaces
    ] = await Promise.all([
      prisma.offer.count({ where: { createdAt: { gte: today } } }),
      prisma.scheduledPost.count({ where: { status: ScheduledPostStatus.SCHEDULED } }),
      prisma.scheduledPost.count({ where: { status: ScheduledPostStatus.PUBLISHED } }),
      prisma.clickEvent.count(),
      prisma.campaign.count({ where: { status: CampaignStatus.ACTIVE } }),
      prisma.integrationLog.count({ where: { status: { in: ["ERROR", "WARNING"] } } }),
      prisma.offer.findMany({
        include: { product: true, marketplace: true, _count: { select: { clickEvents: true, scheduledPosts: true } } },
        orderBy: [{ score: "desc" }, { createdAt: "desc" }],
        take: 10
      }),
      prisma.marketplace.findMany({
        include: { _count: { select: { offers: true, campaigns: true } } },
        orderBy: { name: "asc" }
      })
    ]);

    res.json({
      cards: {
        offersToday,
        scheduledPosts,
        publishedPosts,
        clicks,
        activeCampaigns,
        integrationErrors
      },
      charts: {
        marketplaces: marketplaces.map((marketplace) => ({
          id: marketplace.id,
          name: marketplace.name,
          offers: marketplace._count.offers,
          campaigns: marketplace._count.campaigns
        }))
      },
      topOffers
    });
  })
);

router.get(
  "/offers",
  asyncHandler(async (_req, res) => {
    const offers = await prisma.offer.findMany({
      include: { product: true, marketplace: true, _count: { select: { scheduledPosts: true, clickEvents: true } } },
      orderBy: { createdAt: "desc" },
      take: 200
    });
    res.json(offers);
  })
);

router.get(
  "/campaigns",
  asyncHandler(async (_req, res) => {
    const campaigns = await prisma.campaign.findMany({
      include: { marketplace: true, _count: { select: { scheduledPosts: true } } },
      orderBy: { createdAt: "desc" }
    });
    res.json(campaigns);
  })
);

router.get(
  "/clicks",
  asyncHandler(async (_req, res) => {
    const clicks = await prisma.clickEvent.findMany({
      include: { offer: { include: { product: true, marketplace: true } }, shortLink: true },
      orderBy: { clickedAt: "desc" },
      take: 200
    });
    res.json(clicks);
  })
);

router.get(
  "/errors",
  asyncHandler(async (_req, res) => {
    const errors = await prisma.integrationLog.findMany({
      where: { status: { in: ["ERROR", "WARNING"] } },
      include: { marketplace: true },
      orderBy: { createdAt: "desc" },
      take: 200
    });
    res.json(errors);
  })
);

export default router;
