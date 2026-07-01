import { Channel, ScheduledPostStatus } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { asyncHandler, HttpError } from "../lib/http.js";
import { prisma } from "../lib/prisma.js";
import { publishScheduledPost } from "../services/scheduler.js";

const router = Router();

const scheduledPostSchema = z.object({
  campaignId: z.string().uuid().optional().nullable(),
  offerId: z.string().uuid(),
  channel: z.nativeEnum(Channel),
  message: z.string().min(1),
  scheduledAt: z.coerce.date(),
  status: z.nativeEnum(ScheduledPostStatus).default(ScheduledPostStatus.SCHEDULED)
});

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const status = typeof req.query.status === "string" ? (req.query.status as ScheduledPostStatus) : undefined;
    const posts = await prisma.scheduledPost.findMany({
      where: { status },
      include: {
        campaign: true,
        offer: { include: { product: true, marketplace: true } }
      },
      orderBy: { scheduledAt: "asc" },
      take: 200
    });
    res.json(posts);
  })
);

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const data = scheduledPostSchema.parse(req.body);
    const post = await prisma.scheduledPost.create({ data });
    res.status(201).json(post);
  })
);

router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const post = await prisma.scheduledPost.findUnique({
      where: { id: req.params.id },
      include: {
        campaign: true,
        offer: { include: { product: true, marketplace: true } },
        publishLogs: { orderBy: { createdAt: "desc" } }
      }
    });
    if (!post) throw new HttpError(404, "Publicacao nao encontrada.");
    res.json(post);
  })
);

router.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const data = scheduledPostSchema.partial().parse(req.body);
    const post = await prisma.scheduledPost.update({ where: { id: req.params.id }, data });
    res.json(post);
  })
);

router.post(
  "/:id/publish-now",
  asyncHandler(async (req, res) => {
    const post = await publishScheduledPost(req.params.id!);
    res.json(post);
  })
);

router.post(
  "/:id/copy-whatsapp",
  asyncHandler(async (req, res) => {
    const post = await prisma.scheduledPost.findUnique({ where: { id: req.params.id } });
    if (!post) throw new HttpError(404, "Publicacao nao encontrada.");
    res.json({ message: post.message });
  })
);

router.post(
  "/:id/mark-as-sent",
  asyncHandler(async (req, res) => {
    const data = z.object({ destination: z.string().optional() }).parse(req.body ?? {});
    const post = await prisma.scheduledPost.update({
      where: { id: req.params.id },
      data: {
        status: ScheduledPostStatus.PUBLISHED,
        publishedAt: new Date(),
        publishLogs: {
          create: {
            channel: Channel.WHATSAPP,
            status: "SUCCESS",
            providerResponse: { destination: data.destination, mode: "assisted" }
          }
        }
      }
    });
    res.json(post);
  })
);

router.post(
  "/:id/cancel",
  asyncHandler(async (req, res) => {
    const post = await prisma.scheduledPost.update({
      where: { id: req.params.id },
      data: { status: ScheduledPostStatus.CANCELED }
    });
    res.json(post);
  })
);

export default router;
