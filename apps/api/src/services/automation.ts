import { Channel, ScheduledPostStatus } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { jsonInput, toNumber } from "../lib/sanitize.js";
import { renderOfferMessage } from "./message-service.js";
import { publishScheduledPost } from "./scheduler.js";

const RETRY_LIMIT = 3;

export async function createPublicationSchedule(input: {
  productId?: string;
  offerId?: string;
  creativeAssetId?: string;
  channel: Channel;
  scheduledAt: Date;
  message?: string;
  metadata?: Record<string, unknown>;
}) {
  const offer = input.offerId ? await findOfferById(input.offerId) : await findLatestOfferForProduct(input.productId);
  if (!offer) throw new Error("Oferta nao encontrada para agendamento.");
  const renderedMessage = input.message || (await renderOfferMessage(offer.id, input.channel)).message;
  const post = await prisma.scheduledPost.create({
    data: {
      offerId: offer.id,
      channel: input.channel,
      message: renderedMessage,
      scheduledAt: input.scheduledAt,
      status: ScheduledPostStatus.SCHEDULED
    }
  });

  return prisma.publicationSchedule.create({
    data: {
      productId: offer.productId,
      offerId: offer.id,
      scheduledPostId: post.id,
      creativeAssetId: input.creativeAssetId,
      channel: input.channel,
      message: renderedMessage,
      scheduledAt: input.scheduledAt,
      status: "SCHEDULED",
      metadata: jsonInput({
        ...(input.metadata ?? {}),
        source: "v3_automation",
        flow: "Oferta -> IA -> Criativo -> Aprovacao -> Agendamento -> Publicacao -> Metricas"
      })
    },
    include: publicationInclude
  });
}

export async function generateCreativeAsset(input: {
  productId: string;
  type?: string;
  channel?: string;
  prompt?: string;
  fileUrl?: string;
}) {
  const product = await prisma.product.findFirst({
    where: { id: input.productId, deletedAt: null },
    include: { marketplace: true, offers: { orderBy: { createdAt: "desc" }, take: 1 } }
  });
  if (!product) throw new Error("Produto nao encontrado para criativo.");
  const offer = product.offers[0];
  const prompt =
    input.prompt ||
    [
      `Criativo para afiliado do produto ${product.title}.`,
      offer?.currentPrice ? `Preco atual: ${formatCurrency(toNumber(offer.currentPrice) ?? 0)}.` : "",
      offer?.couponCode ? `Cupom: ${offer.couponCode}.` : "",
      `Canal: ${input.channel || "multicanal"}.`,
      "Foco em conversao, clareza visual e chamada direta."
    ]
      .filter(Boolean)
      .join(" ");

  return prisma.creativeAsset.create({
    data: {
      productId: product.id,
      type: input.type || "IMAGE",
      fileUrl: input.fileUrl || product.imageUrl,
      prompt,
      status: input.fileUrl || product.imageUrl ? "READY" : "PENDING_ASSET",
      channel: input.channel,
      metadata: jsonInput({
        provider: "LOCAL_CREATIVE_BRIEF",
        marketplace: product.marketplace.name,
        title: product.title,
        price: offer?.currentPrice ? toNumber(offer.currentPrice) : undefined,
        affiliateUrl: offer?.affiliateUrl
      })
    },
    include: { product: { include: { marketplace: true } } }
  });
}

export async function publishPublicationSchedule(id: string, options: { force?: boolean } = {}) {
  const schedule = await prisma.publicationSchedule.findUnique({
    where: { id },
    include: { scheduledPost: true }
  });
  if (!schedule) throw new Error("Agendamento V3 nao encontrado.");
  if (!schedule.scheduledPostId) throw new Error("Agendamento V3 sem publicacao vinculada.");

  await prisma.publicationSchedule.update({
    where: { id },
    data: { status: "PROCESSING", attempts: { increment: 1 }, errorMessage: null }
  });

  try {
    const post = await publishScheduledPost(schedule.scheduledPostId, { force: options.force });
    const status = post.status === ScheduledPostStatus.PUBLISHED ? "PUBLISHED" : String(post.status);
    return prisma.publicationSchedule.update({
      where: { id },
      data: {
        status,
        publishedAt: post.publishedAt,
        errorMessage: post.errorMessage,
        attempts: schedule.attempts + 1,
        metadata: jsonInput({
          ...((schedule.metadata as Record<string, unknown> | null) ?? {}),
          lastPublicationStatus: post.status
        })
      },
      include: publicationInclude
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido.";
    return prisma.publicationSchedule.update({
      where: { id },
      data: {
        status: "FAILED",
        attempts: schedule.attempts + 1,
        errorMessage: message
      },
      include: publicationInclude
    });
  }
}

export async function processDuePublicationSchedules() {
  const schedules = await prisma.publicationSchedule.findMany({
    where: {
      status: { in: ["SCHEDULED", "READY_TO_SEND"] },
      scheduledAt: { lte: new Date() }
    },
    orderBy: { scheduledAt: "asc" },
    take: 20
  });
  for (const schedule of schedules) {
    await publishPublicationSchedule(schedule.id);
  }
  return schedules.length;
}

export async function retryFailedPublicationSchedules() {
  const schedules = await prisma.publicationSchedule.findMany({
    where: {
      status: "FAILED",
      attempts: { lt: RETRY_LIMIT }
    },
    orderBy: { updatedAt: "asc" },
    take: 20
  });
  for (const schedule of schedules) {
    await publishPublicationSchedule(schedule.id, { force: true });
  }
  return schedules.length;
}

export async function buildNewsletterDraft(limit = 8) {
  const offers = await prisma.offer.findMany({
    where: { affiliateUrl: { not: null } },
    include: { product: true, marketplace: true },
    orderBy: [{ score: "desc" }, { createdAt: "desc" }],
    take: limit
  });
  const subject = "Ofertas selecionadas pelo PromoPilot 360";
  const body = [
    "Confira as ofertas com maior potencial agora:",
    ...offers.map((offer, index) =>
      [
        `${index + 1}. ${offer.product.title}`,
        offer.currentPrice ? `Preco: ${formatCurrency(toNumber(offer.currentPrice) ?? 0)}` : "",
        offer.couponCode ? `Cupom: ${offer.couponCode}` : "",
        `Link: ${offer.affiliateUrl}`
      ]
        .filter(Boolean)
        .join("\n")
    )
  ].join("\n\n");

  await prisma.integrationLog.create({
    data: {
      operation: "newsletter-send",
      status: "DRAFT",
      requestPayload: jsonInput({ limit }),
      responsePayload: jsonInput({ subject, offers: offers.length })
    }
  });

  return { subject, body, offers };
}

export async function getAutomationDashboard() {
  const now = new Date();
  const [
    scheduled,
    published,
    failed,
    readyCreatives,
    pendingCreatives,
    recentSchedules,
    recentCreatives,
    recentLogs
  ] = await Promise.all([
    prisma.publicationSchedule.count({ where: { status: { in: ["SCHEDULED", "READY_TO_SEND"] } } }),
    prisma.publicationSchedule.count({ where: { status: "PUBLISHED" } }),
    prisma.publicationSchedule.count({ where: { status: "FAILED" } }),
    prisma.creativeAsset.count({ where: { status: "READY" } }),
    prisma.creativeAsset.count({ where: { status: "PENDING_ASSET" } }),
    prisma.publicationSchedule.findMany({
      include: publicationInclude,
      orderBy: [{ scheduledAt: "asc" }, { createdAt: "desc" }],
      take: 50
    }),
    prisma.creativeAsset.findMany({
      include: { product: { include: { marketplace: true } } },
      orderBy: { createdAt: "desc" },
      take: 20
    }),
    prisma.integrationLog.findMany({
      where: { operation: { in: ["publish-queue", "retry-publication", "image-generation", "newsletter-send"] } },
      orderBy: { createdAt: "desc" },
      take: 20
    })
  ]);

  const dueNow = recentSchedules.filter(
    (item) => item.scheduledAt && item.scheduledAt <= now && ["SCHEDULED", "READY_TO_SEND"].includes(item.status)
  ).length;
  return {
    cards: { scheduled, published, failed, readyCreatives, pendingCreatives, dueNow },
    schedules: recentSchedules,
    creatives: recentCreatives,
    logs: recentLogs
  };
}

async function findOfferById(id: string) {
  return prisma.offer.findUnique({ where: { id }, include: { product: true, marketplace: true } });
}

async function findLatestOfferForProduct(productId?: string) {
  if (!productId) return null;
  return prisma.offer.findFirst({
    where: { productId, affiliateUrl: { not: null } },
    include: { product: true, marketplace: true },
    orderBy: [{ score: "desc" }, { createdAt: "desc" }]
  });
}

const publicationInclude = {
  product: { include: { marketplace: true } },
  offer: { include: { product: true, marketplace: true } },
  scheduledPost: true,
  creativeAsset: true
} as const;

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}
