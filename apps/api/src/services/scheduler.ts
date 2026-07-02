import { Channel, ScheduledPostStatus } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { jsonInput } from "../lib/sanitize.js";
import { sendTelegramMessage } from "./telegram.js";
import { sendWhatsAppMessage } from "./whatsapp.js";

export async function publishScheduledPost(id: string, options: { force?: boolean } = {}) {
  const post = await prisma.scheduledPost.findUnique({
    where: { id },
    include: {
      offer: { include: { product: true } },
      campaign: true,
      whatsappGroup: true
    }
  });
  if (!post) throw new Error("Publicacao nao encontrada.");
  if (post.status === ScheduledPostStatus.PUBLISHED) return post;

  if (post.channel === Channel.WHATSAPP) {
    if (!post.whatsappGroupId || (post.campaign?.requireManualApproval && !options.force)) {
      return prisma.scheduledPost.update({
        where: { id },
        data: { status: ScheduledPostStatus.READY_TO_SEND }
      });
    }

    try {
      const providerResponse = await sendWhatsAppMessage({
        groupId: post.whatsappGroupId,
        message: post.message,
        imageUrl: post.offer.product.imageUrl,
        scheduledPostId: post.id
      });
      return prisma.scheduledPost.update({
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
              providerResponse: jsonInput(providerResponse)
            }
          }
        }
      });
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
