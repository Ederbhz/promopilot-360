import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { jsonInput, toNumber } from "../lib/sanitize.js";
import { slugify } from "../lib/slug.js";

const DAY_MS = 24 * 60 * 60 * 1000;

export type DiscountStatus = "desconto_real" | "desconto_moderado" | "desconto_suspeito" | "sem_historico";

export async function analyzeOfferIntelligence(offerId: string, origem = "sistema") {
  const priceHistory = await recordPriceHistoryForOffer(offerId, origem);
  const score = await calculateOfferScoreForOffer(offerId);
  const seoPages = score?.recomendado ? await generateSeoDraftsForOffer(offerId) : [];
  return { priceHistory, score, seoPages };
}

export async function recordPriceHistoryForOffer(offerId: string, origem = "sistema") {
  const offer = await prisma.offer.findUnique({
    where: { id: offerId },
    include: { product: true, marketplace: true }
  });
  if (!offer || offer.currentPrice === null) return null;

  const currentPrice = toNumber(offer.currentPrice);
  if (currentPrice === undefined) return null;

  const last = await prisma.priceHistory.findFirst({
    where: { productId: offer.productId },
    orderBy: { dataColeta: "desc" }
  });
  if (last && toNumber(last.preco) === currentPrice) return last;

  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * DAY_MS);
  const ninetyDaysAgo = new Date(now.getTime() - 90 * DAY_MS);
  const [history30, history90] = await Promise.all([
    prisma.priceHistory.findMany({
      where: { productId: offer.productId, dataColeta: { gte: thirtyDaysAgo } },
      select: { preco: true }
    }),
    prisma.priceHistory.findMany({
      where: { productId: offer.productId, dataColeta: { gte: ninetyDaysAgo } },
      select: { preco: true }
    })
  ]);

  const prices30 = history30.map((item) => toNumber(item.preco)).filter(isNumber);
  const prices90 = history90.map((item) => toNumber(item.preco)).filter(isNumber);
  const menorPreco30d = prices30.length ? Math.min(...prices30, currentPrice) : currentPrice;
  const mediaPreco30d = prices30.length ? average([...prices30, currentPrice]) : undefined;
  const maiorPreco90d = prices90.length ? Math.max(...prices90, currentPrice) : currentPrice;
  const oldPrice = toNumber(offer.oldPrice);
  const informedDiscount = toNumber(offer.discountPercent);
  const referenceCandidates = [oldPrice, mediaPreco30d, maiorPreco90d].filter(
    (value): value is number => isNumber(value) && value > currentPrice
  );
  const referencePrice = referenceCandidates.length ? Math.min(...referenceCandidates) : undefined;
  const realDiscount = referencePrice ? clamp(((referencePrice - currentPrice) / referencePrice) * 100, 0, 100) : undefined;
  const discountStatus = classifyDiscount({
    currentPrice,
    oldPrice,
    mediaPreco30d,
    maiorPreco90d,
    informedDiscount,
    realDiscount,
    hasHistory: prices30.length > 0 || prices90.length > 0
  });

  return prisma.priceHistory.create({
    data: {
      productId: offer.productId,
      marketplaceId: offer.marketplaceId,
      preco: roundMoney(currentPrice),
      precoAnterior: oldPrice === undefined ? undefined : roundMoney(oldPrice),
      menorPreco30d: roundMoney(menorPreco30d),
      mediaPreco30d: mediaPreco30d === undefined ? undefined : roundMoney(mediaPreco30d),
      maiorPreco90d: roundMoney(maiorPreco90d),
      percentualDescontoInformado: informedDiscount === undefined ? undefined : roundPercent(informedDiscount),
      percentualDescontoReal: realDiscount === undefined ? undefined : roundPercent(realDiscount),
      statusDesconto: discountStatus,
      origem
    }
  });
}

export async function calculateOfferScoreForOffer(offerId: string) {
  const offer = await prisma.offer.findUnique({
    where: { id: offerId },
    include: { product: { include: { categoryRef: true } }, marketplace: true }
  });
  if (!offer) return null;

  const latestHistory = await prisma.priceHistory.findFirst({
    where: { productId: offer.productId },
    orderBy: { dataColeta: "desc" }
  });
  const activeCoupons = await findActiveCouponsForOffer({
    productId: offer.productId,
    marketplaceId: offer.marketplaceId,
    categoryId: offer.product.categoryId,
    currentPrice: toNumber(offer.currentPrice)
  });
  const realDiscount = toNumber(latestHistory?.percentualDescontoReal) ?? toNumber(offer.discountPercent) ?? 0;
  const discountSuspicious = latestHistory?.statusDesconto === "desconto_suspeito";
  const scorePreco = discountSuspicious ? 20 : scoreFromDiscount(realDiscount);
  const scoreAvaliacao = scoreFromRating(toNumber(offer.product.rating));
  const scoreVendas = scoreFromVolume(offer.product.reviewCount);
  const scoreComissao = scoreFromCommission(toNumber(offer.commissionPercent), toNumber(offer.estimatedCommission));
  const scoreCupom = activeCoupons.length || offer.couponCode ? 100 : 25;
  const scoreFrete = offer.freeShipping ? 100 : 45;
  const scoreReputacao = offer.marketplace.isActive ? 75 : 35;
  const scoreSeo = scoreFromSeoPotential({
    title: offer.product.title,
    category: offer.product.categoryRef?.name || offer.product.category,
    realDiscount,
    coupon: Boolean(activeCoupons.length || offer.couponCode)
  });
  const scoreTotal = roundPercent(
    scorePreco * 0.3 +
      scoreAvaliacao * 0.15 +
      scoreVendas * 0.1 +
      scoreComissao * 0.15 +
      scoreCupom * 0.1 +
      scoreFrete * 0.05 +
      scoreReputacao * 0.05 +
      scoreSeo * 0.1
  );
  const classificacao = classifyScore(scoreTotal, discountSuspicious);
  const recomendado = !discountSuspicious && scoreTotal >= 75;
  const justificativa = buildScoreReason({
    scoreTotal,
    realDiscount,
    discountSuspicious,
    coupon: Boolean(activeCoupons.length || offer.couponCode),
    rating: toNumber(offer.product.rating),
    freeShipping: offer.freeShipping
  });

  const score = await prisma.offerScore.create({
    data: {
      productId: offer.productId,
      scoreTotal,
      scorePreco: roundPercent(scorePreco),
      scoreDesconto: roundPercent(scorePreco),
      scoreAvaliacao: roundPercent(scoreAvaliacao),
      scoreVendas: roundPercent(scoreVendas),
      scoreComissao: roundPercent(scoreComissao),
      scoreCupom: roundPercent(scoreCupom),
      scoreFrete: roundPercent(scoreFrete),
      scoreReputacao: roundPercent(scoreReputacao),
      scoreSeo: roundPercent(scoreSeo),
      classificacao,
      justificativa,
      recomendado
    }
  });

  await prisma.offer.update({
    where: { id: offer.id },
    data: {
      score: scoreTotal,
      metadata: jsonInput({
        ...((offer.metadata as Record<string, unknown> | null) ?? {}),
        intelligence: {
          realDiscount,
          discountStatus: latestHistory?.statusDesconto ?? "sem_historico",
          classification: classificacao,
          recommended: recomendado,
          activeCoupons: activeCoupons.map((coupon) => coupon.codigo)
        }
      })
    }
  });

  await upsertOpportunity({
    productId: offer.productId,
    scoreId: score.id,
    type: discountSuspicious ? "desconto_suspeito" : recomendado ? "divulgacao" : "baixa_prioridade",
    title: discountSuspicious
      ? `Conferir falsa promocao: ${offer.product.title}`
      : recomendado
      ? `Priorizar divulgacao: ${offer.product.title}`
      : `Monitorar oferta: ${offer.product.title}`,
    description: justificativa,
    priority: discountSuspicious || scoreTotal >= 90 ? "alta" : scoreTotal >= 75 ? "media" : "baixa"
  });

  return score;
}

export async function findActiveCouponsForOffer(input: {
  productId: string;
  marketplaceId: string;
  categoryId?: string | null;
  currentPrice?: number;
}) {
  const now = new Date();
  return prisma.coupon.findMany({
    where: {
      marketplaceId: input.marketplaceId,
      deletedAt: null,
      status: true,
      AND: [
        { OR: [{ dataInicio: null }, { dataInicio: { lte: now } }] },
        { OR: [{ dataFim: null }, { dataFim: { gte: now } }] },
        {
          OR: [
            { valorMinimo: null },
            ...(input.currentPrice === undefined ? [] : [{ valorMinimo: { lte: input.currentPrice } }])
          ]
        },
        {
          OR: [
            { products: { some: { productId: input.productId } } },
            ...(input.categoryId ? [{ categories: { some: { categoryId: input.categoryId } } }] : []),
            { products: { none: {} }, categories: { none: {} } }
          ]
        }
      ]
    },
    include: {
      products: { include: { product: true } },
      categories: { include: { category: true } }
    },
    orderBy: [{ dataFim: "asc" }, { createdAt: "desc" }]
  });
}

export async function generateSeoDraftsForOffer(offerId: string) {
  const offer = await prisma.offer.findUnique({
    where: { id: offerId },
    include: { product: { include: { categoryRef: true } }, marketplace: true }
  });
  if (!offer) return [];

  const category = offer.product.categoryRef?.name || offer.product.category || "ofertas";
  const baseInput = {
    productId: offer.productId,
    categoryId: offer.product.categoryId,
    marketplaceId: offer.marketplaceId,
    productTitle: offer.product.title,
    category,
    marketplace: offer.marketplace.name,
    currentPrice: toNumber(offer.currentPrice),
    couponCode: offer.couponCode,
    affiliateUrl: offer.affiliateUrl || offer.originalUrl
  };
  const drafts = [
    buildSeoDraft({ ...baseInput, tipo: "review", keyword: `${offer.product.title} vale a pena` }),
    buildSeoDraft({ ...baseInput, tipo: "produto_barato", keyword: `${offer.product.title} com desconto` }),
    buildSeoDraft({ ...baseInput, tipo: "cupom", keyword: `${offer.product.title} com cupom` })
  ];

  const created = [];
  for (const draft of drafts) {
    const existing = await prisma.seoPage.findUnique({ where: { slug: draft.slug } });
    if (existing) continue;
    created.push(await prisma.seoPage.create({ data: draft }));
  }
  return created;
}

export async function generateSeoPage(input: {
  productId?: string;
  categoryId?: string;
  marketplaceId?: string;
  tipo: string;
  keyword?: string;
}) {
  const product = input.productId
    ? await prisma.product.findFirst({
        where: { id: input.productId, deletedAt: null },
        include: { marketplace: true, categoryRef: true, offers: { orderBy: { createdAt: "desc" }, take: 1 } }
      })
    : null;
  const category = input.categoryId ? await prisma.category.findFirst({ where: { id: input.categoryId, deletedAt: null } }) : null;
  const marketplace = input.marketplaceId
    ? await prisma.marketplace.findFirst({ where: { id: input.marketplaceId, deletedAt: null } })
    : product?.marketplace ?? null;
  const title = product?.title || category?.name || "Ofertas selecionadas";
  const keyword = input.keyword || `${title} em promocao`;
  const draft = buildSeoDraft({
    productId: product?.id,
    categoryId: category?.id ?? product?.categoryId,
    marketplaceId: marketplace?.id,
    productTitle: title,
    category: category?.name || product?.categoryRef?.name || product?.category || "ofertas",
    marketplace: marketplace?.name || "marketplace",
    currentPrice: product?.offers[0] ? toNumber(product.offers[0].currentPrice) : undefined,
    couponCode: product?.offers[0]?.couponCode ?? undefined,
    affiliateUrl: product?.offers[0]?.affiliateUrl || product?.productUrl,
    tipo: input.tipo,
    keyword
  });
  return prisma.seoPage.create({ data: { ...draft, slug: await uniqueSeoSlug(draft.slug) } });
}

export async function validateCoupons() {
  const now = new Date();
  const [expired, active] = await Promise.all([
    prisma.coupon.updateMany({
      where: { deletedAt: null, dataFim: { lt: now }, status: true },
      data: { status: false }
    }),
    prisma.coupon.updateMany({
      where: {
        deletedAt: null,
        status: false,
        OR: [{ dataFim: null }, { dataFim: { gte: now } }],
        AND: [{ OR: [{ dataInicio: null }, { dataInicio: { lte: now } }] }]
      },
      data: { status: true }
    })
  ]);
  return { expired: expired.count, activated: active.count };
}

export async function runIntelligenceJobs(limit = 50) {
  const couponValidation = await validateCoupons();
  const offers = await prisma.offer.findMany({
    where: { currentPrice: { not: null } },
    orderBy: { updatedAt: "desc" },
    take: limit
  });
  let analyzed = 0;
  for (const offer of offers) {
    await analyzeOfferIntelligence(offer.id, "job_v2");
    analyzed += 1;
  }
  return { couponValidation, analyzed };
}

export async function getIntelligenceDashboard() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today.getTime() + DAY_MS);
  const [
    championOffers,
    recommendedOffers,
    suspiciousOffers,
    activeCoupons,
    couponsEndingToday,
    seoDrafts,
    openOpportunities,
    lowScoreProducts,
    realDiscount20,
    latestHistoryRows
  ] = await Promise.all([
    prisma.offerScore.count({ where: { scoreTotal: { gte: 90 } } }),
    prisma.offerScore.count({ where: { recomendado: true } }),
    prisma.priceHistory.count({ where: { statusDesconto: "desconto_suspeito" } }),
    prisma.coupon.count({ where: { status: true, deletedAt: null } }),
    prisma.coupon.count({ where: { status: true, deletedAt: null, dataFim: { gte: today, lt: tomorrow } } }),
    prisma.seoPage.count({ where: { status: "rascunho", deletedAt: null } }),
    prisma.productOpportunity.count({ where: { status: "aberta" } }),
    prisma.offerScore.count({ where: { scoreTotal: { lt: 60 } } }),
    prisma.priceHistory.count({ where: { percentualDescontoReal: { gte: 20 } } }),
    prisma.priceHistory.findMany({
      distinct: ["productId"],
      orderBy: [{ productId: "asc" }, { dataColeta: "desc" }],
      take: 500
    })
  ]);
  const historicLows = latestHistoryRows.filter((row) => {
    const current = toNumber(row.preco);
    const low = toNumber(row.menorPreco30d);
    return current !== undefined && low !== undefined && current <= low;
  }).length;
  const topRanking = await getOfferRanking({ limit: 10, scoreMinimo: 60 });
  const opportunities = await prisma.productOpportunity.findMany({
    where: { status: "aberta" },
    include: { product: { include: { marketplace: true } }, score: true },
    orderBy: [{ prioridade: "asc" }, { createdAt: "desc" }],
    take: 10
  });
  return {
    cards: {
      championOffers,
      recommendedOffers,
      suspiciousOffers,
      activeCoupons,
      couponsEndingToday,
      historicLows,
      seoDrafts,
      openOpportunities,
      lowScoreProducts,
      realDiscount20
    },
    topRanking,
    opportunities
  };
}

export async function getOfferRanking(filters: {
  marketplaceId?: string;
  categoryId?: string;
  scoreMinimo?: number;
  cupomAtivo?: boolean;
  freteGratis?: boolean;
  limit?: number;
}) {
  const offers = await prisma.offer.findMany({
    where: {
      marketplaceId: filters.marketplaceId,
      product: { categoryId: filters.categoryId },
      score: filters.scoreMinimo === undefined ? undefined : { gte: filters.scoreMinimo },
      freeShipping: filters.freteGratis ? true : undefined,
      affiliateUrl: { not: null }
    },
    include: {
      product: {
        include: {
          marketplace: true,
          categoryRef: true,
          offerScores: { orderBy: { createdAt: "desc" }, take: 1 },
          priceHistory: { orderBy: { dataColeta: "desc" }, take: 1 }
        }
      },
      marketplace: true
    },
    orderBy: [{ score: "desc" }, { createdAt: "desc" }],
    take: filters.limit ?? 50
  });

  if (!filters.cupomAtivo) return offers;
  const result = [];
  for (const offer of offers) {
    const coupons = await findActiveCouponsForOffer({
      productId: offer.productId,
      marketplaceId: offer.marketplaceId,
      categoryId: offer.product.categoryId,
      currentPrice: toNumber(offer.currentPrice)
    });
    if (coupons.length || offer.couponCode) result.push(offer);
  }
  return result;
}

function classifyDiscount(input: {
  currentPrice: number;
  oldPrice?: number;
  mediaPreco30d?: number;
  maiorPreco90d?: number;
  informedDiscount?: number;
  realDiscount?: number;
  hasHistory: boolean;
}): DiscountStatus {
  if (!input.hasHistory && input.realDiscount === undefined) return "sem_historico";
  const suspicious =
    (input.mediaPreco30d !== undefined && input.currentPrice >= input.mediaPreco30d) ||
    (input.oldPrice !== undefined &&
      input.maiorPreco90d !== undefined &&
      input.maiorPreco90d > 0 &&
      input.oldPrice > input.maiorPreco90d * 1.2) ||
    (input.informedDiscount !== undefined &&
      input.realDiscount !== undefined &&
      input.informedDiscount - input.realDiscount > 20);
  if (suspicious) return "desconto_suspeito";
  if ((input.realDiscount ?? 0) >= 15) return "desconto_real";
  return "desconto_moderado";
}

function scoreFromDiscount(value: number) {
  if (value >= 35) return 100;
  if (value >= 25) return 90;
  if (value >= 15) return 75;
  if (value >= 8) return 55;
  if (value > 0) return 35;
  return 15;
}

function scoreFromRating(value?: number) {
  if (value === undefined) return 55;
  return clamp((value / 5) * 100, 0, 100);
}

function scoreFromVolume(value?: number | null) {
  if (!value) return 35;
  if (value >= 1000) return 100;
  if (value >= 500) return 85;
  if (value >= 100) return 70;
  if (value >= 25) return 55;
  return 40;
}

function scoreFromCommission(percent?: number, estimated?: number) {
  if (percent !== undefined) return clamp(percent * 12, 25, 100);
  if (estimated !== undefined) return clamp(estimated * 4, 25, 100);
  return 45;
}

function scoreFromSeoPotential(input: { title: string; category?: string | null; realDiscount: number; coupon: boolean }) {
  let score = 45;
  if (input.title.length >= 18) score += 15;
  if (input.category) score += 15;
  if (input.realDiscount >= 15) score += 15;
  if (input.coupon) score += 10;
  return clamp(score, 0, 100);
}

function classifyScore(score: number, suspicious: boolean) {
  if (suspicious) return "Oferta suspeita";
  if (score >= 90) return "Oferta campea";
  if (score >= 75) return "Boa oferta";
  if (score >= 60) return "Oferta moderada";
  return "Nao recomendar";
}

function buildScoreReason(input: {
  scoreTotal: number;
  realDiscount: number;
  discountSuspicious: boolean;
  coupon: boolean;
  rating?: number;
  freeShipping?: boolean | null;
}) {
  const parts = [`Score ${Math.round(input.scoreTotal)}`];
  if (input.discountSuspicious) parts.push("desconto suspeito frente ao historico");
  else if (input.realDiscount > 0) parts.push(`desconto real de ${Math.round(input.realDiscount)}%`);
  if (input.coupon) parts.push("cupom ativo");
  if (input.rating) parts.push(`avaliacao ${input.rating.toFixed(1)}/5`);
  if (input.freeShipping) parts.push("frete gratis");
  return `${parts.join(", ")}.`;
}

async function upsertOpportunity(input: {
  productId: string;
  scoreId: string;
  type: string;
  title: string;
  description: string;
  priority: string;
}) {
  const existing = await prisma.productOpportunity.findFirst({
    where: { productId: input.productId, tipo: input.type, status: "aberta" }
  });
  const data = {
    scoreId: input.scoreId,
    titulo: input.title,
    descricao: input.description,
    prioridade: input.priority
  };
  if (existing) {
    return prisma.productOpportunity.update({ where: { id: existing.id }, data });
  }
  return prisma.productOpportunity.create({
    data: {
      productId: input.productId,
      tipo: input.type,
      ...data
    }
  });
}

function buildSeoDraft(input: {
  productId?: string;
  categoryId?: string | null;
  marketplaceId?: string;
  productTitle: string;
  category: string;
  marketplace: string;
  currentPrice?: number;
  couponCode?: string | null;
  affiliateUrl?: string | null;
  tipo: string;
  keyword: string;
}) {
  const slug = slugForSeoType(input.tipo, input.productTitle, input.category);
  const price = input.currentPrice ? formatCurrency(input.currentPrice) : "preco sujeito a alteracao";
  const couponLine = input.couponCode ? `Use o cupom ${input.couponCode} antes de finalizar a compra.` : "Confira se ha cupom ativo antes de concluir.";
  return {
    productId: input.productId,
    categoryId: input.categoryId ?? undefined,
    marketplaceId: input.marketplaceId,
    tipo: input.tipo,
    slug,
    tituloSeo: titleForSeoType(input.tipo, input.productTitle, input.category),
    metaDescription: `${input.productTitle} em ${input.marketplace}: veja preco, cupom, vantagens e se vale a pena comprar.`,
    h1: titleForSeoType(input.tipo, input.productTitle, input.category),
    conteudo: [
      `## Introducao\n${input.productTitle} e uma oferta monitorada pelo PromoPilot 360 na categoria ${input.category}.`,
      `## Ficha do produto\nMarketplace: ${input.marketplace}\nPreco atual: ${price}`,
      `## Pontos positivos\n- Produto com potencial de conversao\n- Oferta acompanhada por historico de preco\n- Link afiliado pronto para divulgacao`,
      `## Pontos de atencao\n- Preco e estoque podem mudar sem aviso\n- Valide o prazo e as regras do marketplace antes de publicar`,
      `## Preco e cupom\n${couponLine}`,
      `## Para quem e indicado\nPara compradores pesquisando ${input.category} com foco em custo-beneficio.`,
      `## CTA\nVer oferta: ${input.affiliateUrl || "link pendente"}`
    ].join("\n\n"),
    faq: jsonInput([
      { question: `${input.productTitle} vale a pena?`, answer: "Vale conferir quando o score e o desconto real estiverem altos." },
      { question: "O preco pode mudar?", answer: "Sim. Preco, cupom e estoque podem mudar sem aviso." }
    ]),
    schemaJson: jsonInput({
      "@context": "https://schema.org",
      "@type": "Product",
      name: input.productTitle,
      category: input.category,
      offers: {
        "@type": "Offer",
        url: input.affiliateUrl,
        priceCurrency: "BRL",
        price: input.currentPrice
      }
    }),
    palavraChavePrincipal: input.keyword,
    palavrasChaveSecundarias: [`${input.productTitle} promocao`, `${input.category} com desconto`, `${input.marketplace} ofertas`],
    status: "rascunho"
  };
}

function slugForSeoType(type: string, title: string, category: string) {
  if (type === "review") return `produto/${slugify(title)}-vale-a-pena`;
  if (type === "cupom") return `cupons/${slugify(title)}-com-cupom`;
  if (type === "categoria") return `ofertas/${slugify(category)}`;
  if (type === "melhores_produtos") return `melhores/${slugify(category)}`;
  return `promocoes/${slugify(title)}`;
}

function titleForSeoType(type: string, title: string, category: string) {
  if (type === "review") return `${title} vale a pena?`;
  if (type === "cupom") return `${title} com cupom`;
  if (type === "categoria") return `Melhores ofertas de ${category}`;
  if (type === "melhores_produtos") return `Melhores ${category} em promocao`;
  return `${title} com desconto`;
}

async function uniqueSeoSlug(base: string) {
  let slug = base;
  let index = 2;
  while (await prisma.seoPage.findUnique({ where: { slug } })) {
    slug = `${base}-${index}`;
    index += 1;
  }
  return slug;
}

function average(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function roundPercent(value: number) {
  return Math.round(value * 100) / 100;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

export function safeJson(value: unknown): Prisma.InputJsonValue | undefined {
  return jsonInput(value);
}
