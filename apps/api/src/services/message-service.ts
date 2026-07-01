import { Channel } from "@prisma/client";
import { buildTemplateVariables, renderMessageTemplate } from "@promopilot/message-templates";
import { prisma } from "../lib/prisma.js";
import { toNumber } from "../lib/sanitize.js";

export async function renderOfferMessage(offerId: string, channel: Channel, templateId?: string) {
  const offer = await prisma.offer.findUnique({
    where: { id: offerId },
    include: { product: true, marketplace: true }
  });
  if (!offer) throw new Error("Oferta nao encontrada.");

  const template =
    (templateId
      ? await prisma.messageTemplate.findUnique({ where: { id: templateId } })
      : null) ??
    (await prisma.messageTemplate.findFirst({
      where: { channel, isDefault: true }
    })) ??
    (await prisma.messageTemplate.findFirst({ where: { channel } }));

  if (!template) throw new Error("Nenhum template encontrado para o canal.");

  const message = renderMessageTemplate(
    template.content,
    buildTemplateVariables({
      title: offer.product.title,
      currentPrice: toNumber(offer.currentPrice),
      oldPrice: toNumber(offer.oldPrice),
      discountPercent: toNumber(offer.discountPercent),
      couponCode: offer.couponCode,
      marketplace: offer.marketplace.name,
      rating: toNumber(offer.product.rating),
      freeShipping: offer.freeShipping,
      affiliateUrl: offer.affiliateUrl,
      productUrl: offer.originalUrl,
      validUntil: offer.validUntil
    })
  );

  return { message, template, offer };
}
