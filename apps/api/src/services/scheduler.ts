import { Channel, ScheduledPostStatus } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { sendTelegramMessage } from "./telegram.js";

export async function publishScheduledPost(id: string) {
  const post = await prisma.scheduledPost.findUnique({
    where: { id },
    include: {
      offer: { include: { product: true } },
      campaign: true
    }
  });
  if (!post) throw new Error("Publicacao nao encontrada.");
  if (post.status === ScheduledPostStatus.PUBLISHED) return post;

  if (post.channel === Channel.WHATSAPP) {
    return prisma.scheduledPost.update({
      where: { id },
      data: { status: ScheduledPostStatus.READY_TO_SEND }
    });
  }

  if (post.channel !== Channel.TELEGRAM) {
    return prisma.scheduledPost.update({
      where: { id },
      data: { status: ScheduledPostStatus.READY_TO_SEND }
    });
  }

  try {
    const providerResponse = await sendTelegramMessage({
      message: post.message,
      imageUrl: post.offer.product.imageUrl
    });

    const updated = await prisma.scheduledPost.update({
      where: { id },
      data: {
        status: ScheduledPostStatus.PUBLISHED,
        publishedAt: new Date(),
        offer: { update: { status: "PUBLISHED" } },
        publishLogs: {
          create: {
            offerId: post.offerId,
            channel: post.channel,
            status: "SUCCESS",
            providerResponse
          }
        }
      }
    });
    return updated;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido.";
    await prisma.publishLog.create({
      data: {
        scheduledPostId: post.id,
        offerId: post.offerId,
        channel: post.channel,
        status: "ERROR",
        errorMessage: message
      }
    });
    return prisma.scheduledPost.update({
      where: { id },
      data: {
        status: ScheduledPostStatus.FAILED,
        errorMessage: message,
        retryCount: { increment: 1 }
      }
    });
  }
}

export async function processDueScheduledPosts() {
  const posts = await prisma.scheduledPost.findMany({
    where: {
      status: ScheduledPostStatus.SCHEDULED,
      scheduledAt: { lte: new Date() }
    },
    take: 20,
    orderBy: { scheduledAt: "asc" }
  });

  for (const post of posts) {
    await publishScheduledPost(post.id);
  }

  return posts.length;
}
