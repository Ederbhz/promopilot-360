import { Channel, Prisma } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { recordAudit } from "../lib/audit.js";
import { asyncHandler, HttpError } from "../lib/http.js";
import { prisma } from "../lib/prisma.js";
import { jsonInput } from "../lib/sanitize.js";

const router = Router();

const generateSchema = z
  .object({
    offerId: z.string().uuid().optional(),
    productId: z.string().uuid().optional(),
    channel: z.nativeEnum(Channel).default(Channel.WHATSAPP),
    tone: z.string().trim().default("promocional"),
    prompt: z.string().trim().optional(),
    productTitle: z.string().trim().optional(),
    productUrl: z.string().trim().url().optional(),
    affiliateUrl: z.string().trim().url().optional(),
    marketplaceName: z.string().trim().optional(),
    category: z.string().trim().optional(),
    currentPrice: z.coerce.number().min(0).optional(),
    oldPrice: z.coerce.number().min(0).optional(),
    discountPercent: z.coerce.number().min(0).max(100).optional(),
    couponCode: z.string().trim().optional()
  })
  .superRefine((data, ctx) => {
    if (!data.offerId && !data.productId && !data.productTitle) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Informe uma oferta, produto ou titulo manual para gerar conteudo.",
        path: ["productTitle"]
      });
    }
  });

router.get(
  "/generated-contents",
  asyncHandler(async (req, res) => {
    const offerId = typeof req.query.offerId === "string" ? req.query.offerId : undefined;
    const productId = typeof req.query.productId === "string" ? req.query.productId : undefined;
    const contents = await prisma.generatedContent.findMany({
      where: { deletedAt: null, offerId, productId },
      include: {
        offer: { include: { product: true, marketplace: true } },
        product: { include: { marketplace: true, categoryRef: true, brandRef: true } },
        createdBy: { select: { id: true, name: true, email: true } }
      },
      orderBy: { createdAt: "desc" },
      take: 100
    });
    res.json(contents);
  })
);

router.post(
  "/generate",
  asyncHandler(async (req, res) => {
    const data = generateSchema.parse(req.body);
    const source = await resolveContentSource(data);
    const content = buildPromotionalContent({ ...source, channel: data.channel, tone: data.tone, prompt: data.prompt });

    const generated = await prisma.generatedContent.create({
      data: {
        offerId: source.offerId,
        productId: source.productId,
        createdById: req.user?.id,
        channel: data.channel,
        title: source.title.slice(0, 180),
        prompt: data.prompt,
        content,
        tone: data.tone,
        metadata: jsonInput({
          provider: "LOCAL_MVP",
          marketplaceName: source.marketplaceName,
          category: source.category,
          couponCode: source.couponCode,
          priceSnapshot: {
            currentPrice: source.currentPrice,
            oldPrice: source.oldPrice,
            discountPercent: source.discountPercent
          }
        })
      },
      include: {
        offer: { include: { product: true, marketplace: true } },
        product: { include: { marketplace: true, categoryRef: true, brandRef: true } }
      }
    });

    await recordAudit(req, {
      entity: "GeneratedContent",
      entityId: generated.id,
      action: "create",
      after: generated
    });

    res.status(201).json(generated);
  })
);

router.delete(
  "/generated-contents/:id",
  asyncHandler(async (req, res) => {
    const before = await prisma.generatedContent.findFirst({ where: { id: req.params.id, deletedAt: null } });
    if (!before) throw new HttpError(404, "Conteudo gerado nao encontrado.");
    const generated = await prisma.generatedContent.update({
      where: { id: before.id },
      data: { deletedAt: new Date() }
    });
    await recordAudit(req, {
      entity: "GeneratedContent",
      entityId: generated.id,
      action: "delete",
      before,
      after: generated
    });
    res.status(204).end();
  })
);

async function resolveContentSource(data: z.infer<typeof generateSchema>) {
  if (data.offerId) {
    const offer = await prisma.offer.findUnique({
      where: { id: data.offerId },
      include: { product: { include: { categoryRef: true, brandRef: true } }, marketplace: true }
    });
    if (!offer) throw new HttpError(404, "Oferta nao encontrada.");
    return {
      offerId: offer.id,
      productId: offer.productId,
      title: offer.product.title,
      url: offer.affiliateUrl || offer.originalUrl,
      marketplaceName: offer.marketplace.name,
      category: offer.product.categoryRef?.name || offer.product.category || undefined,
      currentPrice: numberValue(offer.currentPrice),
      oldPrice: numberValue(offer.oldPrice),
      discountPercent: numberValue(offer.discountPercent),
      couponCode: offer.couponCode ?? undefined
    };
  }

  if (data.productId) {
    const product = await prisma.product.findFirst({
      where: { id: data.productId, deletedAt: null },
      include: { marketplace: true, categoryRef: true, brandRef: true }
    });
    if (!product) throw new HttpError(404, "Produto nao encontrado.");
    return {
      productId: product.id,
      title: product.title,
      url: data.affiliateUrl || product.productUrl,
      marketplaceName: product.marketplace.name,
      category: product.categoryRef?.name || product.category || undefined,
      currentPrice: data.currentPrice,
      oldPrice: data.oldPrice,
      discountPercent: data.discountPercent,
      couponCode: data.couponCode
    };
  }

  return {
    title: data.productTitle!,
    url: data.affiliateUrl || data.productUrl,
    marketplaceName: data.marketplaceName,
    category: data.category,
    currentPrice: data.currentPrice,
    oldPrice: data.oldPrice,
    discountPercent: data.discountPercent,
    couponCode: data.couponCode
  };
}

function buildPromotionalContent(input: {
  title: string;
  url?: string;
  marketplaceName?: string;
  category?: string;
  currentPrice?: number;
  oldPrice?: number;
  discountPercent?: number;
  couponCode?: string;
  channel: Channel;
  tone?: string;
  prompt?: string;
}) {
  const priceLine = buildPriceLine(input);
  const couponLine = input.couponCode ? `Cupom: ${input.couponCode}` : "";
  const categoryLine = input.category ? `Categoria: ${input.category}` : "";
  const marketplaceLine = input.marketplaceName ? `Disponivel em ${input.marketplaceName}.` : "";
  const linkLine = input.url ? `Comprar agora: ${input.url}` : "Link de compra pendente.";
  const promptLine = input.prompt ? `Direcao criativa: ${input.prompt}` : "";

  if (input.channel === Channel.INSTAGRAM) {
    return [
      `${headlineForTone(input.tone)} ${input.title}`,
      priceLine,
      couponLine,
      marketplaceLine,
      "Salve para comparar e envie para quem estava esperando uma boa oferta.",
      linkLine,
      buildHashtags(input)
    ]
      .filter(Boolean)
      .join("\n\n");
  }

  if (input.channel === Channel.TELEGRAM) {
    return [
      `OFERTA SELECIONADA: ${input.title}`,
      priceLine,
      couponLine,
      categoryLine,
      marketplaceLine,
      linkLine,
      "Preco e disponibilidade podem mudar sem aviso."
    ]
      .filter(Boolean)
      .join("\n\n");
  }

  return [
    `${headlineForTone(input.tone)} ${input.title}`,
    priceLine,
    couponLine,
    marketplaceLine,
    promptLine,
    "Boa opcao para divulgar agora no fluxo de afiliados.",
    linkLine,
    "Confira antes de publicar: preco, estoque e regras do marketplace."
  ]
    .filter(Boolean)
    .join("\n\n");
}

function buildPriceLine(input: { currentPrice?: number; oldPrice?: number; discountPercent?: number }) {
  if (!input.currentPrice) return "";
  const parts = [`Por: ${formatCurrency(input.currentPrice)}`];
  if (input.oldPrice) parts.unshift(`De: ${formatCurrency(input.oldPrice)}`);
  if (input.discountPercent) parts.push(`Desconto: ${Math.round(input.discountPercent)}%`);
  return parts.join(" | ");
}

function headlineForTone(tone: string | undefined) {
  const normalized = tone?.toLowerCase() ?? "";
  if (normalized.includes("urg")) return "Oferta por tempo limitado:";
  if (normalized.includes("premium")) return "Achado premium:";
  if (normalized.includes("direto")) return "Oferta direta:";
  return "Oferta encontrada:";
}

function buildHashtags(input: { category?: string; marketplaceName?: string }) {
  const tags = ["#promocao", "#oferta", "#achadinhos"];
  if (input.category) tags.push(`#${tagify(input.category)}`);
  if (input.marketplaceName) tags.push(`#${tagify(input.marketplaceName)}`);
  return tags.join(" ");
}

function tagify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toLowerCase();
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function numberValue(value: Prisma.Decimal | null) {
  if (value === null) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export default router;
