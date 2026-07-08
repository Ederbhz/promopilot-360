import { Channel, OfferStatus } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { jsonInput, toNumber } from "../lib/sanitize.js";
import { createPublicationSchedule, generateCreativeAsset } from "./automation.js";
import { generateSeoPage } from "./intelligence.js";

const AGENTS = ["scout", "content", "seo", "creative", "publisher", "analytics", "affiliate", "vector-indexing"] as const;
type AgentName = (typeof AGENTS)[number];

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_ALLOWED_CHANNELS = ["TELEGRAM", "INSTAGRAM", "FACEBOOK"];

export function listAgentNames() {
  return [...AGENTS];
}

export async function runAgent(agentName: string, input: Record<string, unknown> = {}, userId?: string) {
  const normalized = normalizeAgentName(agentName);
  const policy = await getAutonomyPolicy();
  await assertAiCostBudget(policy);

  const run = await prisma.agentRun.create({
    data: {
      agentName: normalized,
      input: jsonInput(input),
      status: "running",
      startedAt: new Date()
    }
  });

  try {
    const output = await dispatchAgent(normalized, input, policy);
    const usage = estimateUsage(input, output);
    await prisma.aiCostControl.create({
      data: {
        provider: "LOCAL_HYBRID",
        model: "promopilot-v4-rules",
        operation: normalized,
        tokensInput: usage.tokensInput,
        tokensOutput: usage.tokensOutput,
        estimatedCost: usage.estimatedCost,
        userId
      }
    });
    return prisma.agentRun.update({
      where: { id: run.id },
      data: {
        output: jsonInput(output),
        status: "success",
        tokensInput: usage.tokensInput,
        tokensOutput: usage.tokensOutput,
        estimatedCost: usage.estimatedCost,
        finishedAt: new Date()
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido.";
    return prisma.agentRun.update({
      where: { id: run.id },
      data: {
        status: "error",
        errorMessage: message,
        finishedAt: new Date()
      }
    });
  }
}

export async function getAutonomyPolicy() {
  return (
    (await prisma.autonomyPolicy.findFirst({ where: { active: true }, orderBy: { createdAt: "asc" } })) ??
    (await prisma.autonomyPolicy.create({
      data: {
        id: "default-autonomy-policy",
        name: "Default",
        mode: "manual",
        allowedChannels: DEFAULT_ALLOWED_CHANNELS,
        minScore: 75,
        dailyAiCostLimit: 5,
        active: true
      }
    }))
  );
}

export async function updateAutonomyPolicy(input: {
  mode?: string;
  dailyPublicationLimit?: number;
  allowedChannels?: string[];
  minScore?: number;
  minCommission?: number | null;
  startTime?: string | null;
  endTime?: string | null;
  requireCoupon?: boolean;
  dailyAiCostLimit?: number;
}) {
  const policy = await getAutonomyPolicy();
  return prisma.autonomyPolicy.update({
    where: { id: policy.id },
    data: {
      mode: input.mode,
      dailyPublicationLimit: input.dailyPublicationLimit,
      allowedChannels: input.allowedChannels,
      minScore: input.minScore,
      minCommission: input.minCommission,
      startTime: input.startTime,
      endTime: input.endTime,
      requireCoupon: input.requireCoupon,
      dailyAiCostLimit: input.dailyAiCostLimit
    }
  });
}

export async function listRecommendations(status?: string) {
  return prisma.aiRecommendation.findMany({
    where: { status },
    include: { product: { include: { marketplace: true, offers: { orderBy: { createdAt: "desc" }, take: 1 } } } },
    orderBy: [{ status: "asc" }, { confidence: "desc" }, { createdAt: "desc" }],
    take: 200
  });
}

export async function acceptRecommendation(id: string, userId?: string) {
  return prisma.aiRecommendation.update({
    where: { id },
    data: {
      status: "accepted",
      acceptedById: userId,
      acceptedAt: new Date()
    },
    include: { product: true }
  });
}

export async function rejectRecommendation(id: string, reason?: string) {
  return prisma.aiRecommendation.update({
    where: { id },
    data: {
      status: "rejected",
      rejectedReason: reason || "Rejeitada pelo usuario."
    },
    include: { product: true }
  });
}

export async function executeRecommendation(id: string, userId?: string) {
  const recommendation = await prisma.aiRecommendation.findUnique({
    where: { id },
    include: { product: { include: { offers: { orderBy: { score: "desc" }, take: 1 } } } }
  });
  if (!recommendation) throw new Error("Recomendacao nao encontrada.");
  const metadata = (recommendation.metadata as Record<string, unknown> | null) ?? {};
  let result: unknown = null;

  if (recommendation.recommendationType === "gerar_criativo" && recommendation.productId) {
    result = await generateCreativeAsset({
      productId: recommendation.productId,
      type: stringValue(metadata.format) || "IMAGE",
      channel: stringValue(metadata.bestChannel) || "INSTAGRAM",
      prompt: recommendation.description ?? undefined
    });
  } else if (recommendation.recommendationType === "gerar_seo" && recommendation.productId) {
    result = await generateSeoPage({
      productId: recommendation.productId,
      tipo: stringValue(metadata.seoType) || "review",
      keyword: stringValue(metadata.keyword) || recommendation.title || undefined
    });
  } else if (
    ["divulgar_produto", "republicar", "trocar_horario", "trocar_canal"].includes(
      recommendation.recommendationType || ""
    )
  ) {
    const offer = recommendation.product?.offers[0];
    if (!offer) throw new Error("Produto sem oferta para publicar.");
    result = await createPublicationSchedule({
      offerId: offer.id,
      channel: channelFromValue(stringValue(metadata.bestChannel) || "TELEGRAM"),
      scheduledAt: dateFromRecommendation(metadata),
      metadata: {
        recommendationId: recommendation.id,
        agentName: recommendation.agentName
      }
    });
  } else if (recommendation.recommendationType === "pausar_produto" && recommendation.productId) {
    result = await prisma.offer.updateMany({
      where: { productId: recommendation.productId },
      data: { status: OfferStatus.PAUSED }
    });
  }

  const updated = await prisma.aiRecommendation.update({
    where: { id },
    data: {
      status: "executed",
      acceptedById: userId,
      acceptedAt: new Date(),
      metadata: jsonInput({ ...metadata, executionResult: summarizeExecution(result) })
    }
  });
  return { recommendation: updated, result };
}

export async function syncPerformanceMetrics() {
  await prisma.performanceMetric.deleteMany({});
  const schedules = await prisma.publicationSchedule.findMany({
    include: {
      offer: { include: { product: true, clickEvents: true } },
      product: true
    },
    orderBy: { createdAt: "desc" },
    take: 1000
  });
  const legacyPosts = await prisma.scheduledPost.findMany({
    where: { publicationSchedule: null },
    include: { offer: { include: { product: true, clickEvents: true } } },
    orderBy: { createdAt: "desc" },
    take: 1000
  });

  const data = [
    ...schedules.map((schedule) => {
      const clicks = schedule.offer?.clickEvents.length ?? 0;
      const impressions = schedule.status === "PUBLISHED" ? Math.max(100, clicks * 8) : 0;
      return {
        productId: schedule.productId ?? schedule.offer?.productId,
        publicationId: schedule.id,
        channel: schedule.channel,
        impressions,
        clicks,
        conversions: 0,
        revenue: 0,
        commission: 0,
        ctr: impressions ? roundMetric((clicks / impressions) * 100) : 0,
        conversionRate: 0,
        dateReference: truncateDate(schedule.publishedAt ?? schedule.scheduledAt ?? schedule.createdAt)
      };
    }),
    ...legacyPosts.map((post) => {
      const clicks = post.offer.clickEvents.length;
      const impressions = post.status === "PUBLISHED" ? Math.max(100, clicks * 8) : 0;
      return {
        productId: post.offer.productId,
        channel: post.channel,
        impressions,
        clicks,
        conversions: 0,
        revenue: 0,
        commission: 0,
        ctr: impressions ? roundMetric((clicks / impressions) * 100) : 0,
        conversionRate: 0,
        dateReference: truncateDate(post.publishedAt ?? post.scheduledAt ?? post.createdAt)
      };
    })
  ].filter((item) => item.productId);

  if (data.length) await prisma.performanceMetric.createMany({ data });
  return { metrics: data.length };
}

export async function getAnalyticsOverview() {
  if ((await prisma.performanceMetric.count()) === 0) await syncPerformanceMetrics();
  const [metrics, recommendations, runs, aiCosts] = await Promise.all([
    prisma.performanceMetric.findMany({
      include: { product: { include: { marketplace: true, categoryRef: true } } },
      orderBy: { createdAt: "desc" },
      take: 1000
    }),
    prisma.aiRecommendation.findMany({ orderBy: { createdAt: "desc" }, take: 200 }),
    prisma.agentRun.findMany({ orderBy: { createdAt: "desc" }, take: 200 }),
    prisma.aiCostControl.findMany({ orderBy: { createdAt: "desc" }, take: 1000 })
  ]);
  const clicks = metrics.reduce((sum, item) => sum + item.clicks, 0);
  const impressions = metrics.reduce((sum, item) => sum + item.impressions, 0);
  const conversions = metrics.reduce((sum, item) => sum + item.conversions, 0);
  const revenue = metrics.reduce((sum, item) => sum + (toNumber(item.revenue) ?? 0), 0);
  const commission = metrics.reduce((sum, item) => sum + (toNumber(item.commission) ?? 0), 0);
  const aiCost = aiCosts.reduce((sum, item) => sum + (toNumber(item.estimatedCost) ?? 0), 0);
  const channels = groupMetrics(metrics, (item) => item.channel || "MANUAL");
  const products = groupMetrics(metrics, (item) => item.product?.title || "Produto");
  const categories = groupMetrics(metrics, (item) => item.product?.categoryRef?.name || item.product?.category || "Sem categoria");
  const marketplaces = groupMetrics(metrics, (item) => item.product?.marketplace.name || "Marketplace");
  const bestChannel = pickBest(channels);
  const bestProduct = pickBest(products);
  const bestCategory = pickBest(categories);
  const bestMarketplace = pickBest(marketplaces);
  const bestHour = await findBestHour();
  return {
    cards: {
      estimatedRevenue: roundMoney(revenue),
      estimatedCommission: roundMoney(commission),
      clicks,
      conversions,
      ctr: impressions ? roundMetric((clicks / impressions) * 100) : 0,
      conversionRate: clicks ? roundMetric((conversions / clicks) * 100) : 0,
      bestMarketplace: bestMarketplace?.key ?? "-",
      bestCategory: bestCategory?.key ?? "-",
      bestHour,
      bestProduct: bestProduct?.key ?? "-",
      agentRuns: runs.length,
      acceptedRecommendations: recommendations.filter((item) => item.status === "accepted" || item.status === "executed").length,
      rejectedRecommendations: recommendations.filter((item) => item.status === "rejected").length,
      aiCost: roundCost(aiCost),
      estimatedRoi: aiCost ? roundMetric(((commission - aiCost) / aiCost) * 100) : 0
    },
    channels,
    products: products.slice(0, 10),
    categories,
    marketplaces,
    recentRuns: runs.slice(0, 10),
    recentRecommendations: recommendations.slice(0, 10)
  };
}

export async function trainMlModel() {
  await syncPerformanceMetrics();
  await prisma.integrationLog.create({
    data: {
      operation: "ml-training",
      status: "SUCCESS",
      responsePayload: jsonInput({
        model: "hybrid-rules-v1",
        trainedAt: new Date().toISOString()
      })
    }
  });
  return {
    modelName: "hybrid-rules-v1",
    status: "trained",
    features: [
      "score",
      "desconto_real",
      "cupom_ativo",
      "canal",
      "hora",
      "historico_ctr",
      "comissao"
    ]
  };
}

export async function predictPerformance(input: { productId: string; channel?: string; hour?: number }) {
  const product = await prisma.product.findFirst({
    where: { id: input.productId, deletedAt: null },
    include: {
      marketplace: true,
      offers: { orderBy: { score: "desc" }, take: 1 },
      performanceMetrics: true,
      priceHistory: { orderBy: { dataColeta: "desc" }, take: 1 }
    }
  });
  if (!product) throw new Error("Produto nao encontrado.");
  const offer = product.offers[0];
  const score = toNumber(offer?.score) ?? 50;
  const historyCtr = average(product.performanceMetrics.map((item) => toNumber(item.ctr) ?? 0));
  const realDiscount = toNumber(product.priceHistory[0]?.percentualDescontoReal) ?? toNumber(offer?.discountPercent) ?? 0;
  const channelBoost = input.channel === "WHATSAPP" ? 0.08 : input.channel === "INSTAGRAM" ? 0.06 : 0.04;
  const hourBoost = input.hour && input.hour >= 19 && input.hour <= 21 ? 0.08 : 0.03;
  const clickChance = clamp(score / 100 * 0.55 + realDiscount / 100 * 0.18 + historyCtr / 100 * 0.12 + channelBoost + hourBoost, 0, 1);
  const prediction = await prisma.mlPrediction.create({
    data: {
      productId: product.id,
      modelName: "hybrid-rules-v1",
      predictionType: "click_chance",
      predictionValue: roundPrediction(clickChance),
      confidence: clamp(65 + product.performanceMetrics.length * 2, 65, 92),
      features: jsonInput({
        score,
        realDiscount,
        historyCtr,
        channel: input.channel,
        hour: input.hour,
        marketplace: product.marketplace.name
      }),
      explanation: `Chance estimada por score ${Math.round(score)}, desconto real ${Math.round(realDiscount)}% e historico CTR ${roundMetric(historyCtr)}%.`
    }
  });
  return prediction;
}

export async function listMlModels() {
  return [
    {
      name: "hybrid-rules-v1",
      status: "active",
      predictionTypes: ["click_chance", "best_channel", "best_hour"],
      description: "Modelo hibrido inicial com regras de negocio, score estatistico e historico real."
    }
  ];
}

export async function indexVectorDocuments(limit = 100) {
  const [products, contents, seoPages] = await Promise.all([
    prisma.product.findMany({
      where: { deletedAt: null },
      include: { marketplace: true, categoryRef: true, offers: { orderBy: { createdAt: "desc" }, take: 1 } },
      take: limit
    }),
    prisma.generatedContent.findMany({ where: { deletedAt: null }, take: limit, orderBy: { createdAt: "desc" } }),
    prisma.seoPage.findMany({ where: { deletedAt: null }, take: limit, orderBy: { createdAt: "desc" } })
  ]);

  let indexed = 0;
  for (const product of products) {
    const offer = product.offers[0];
    const content = [
      product.title,
      product.description,
      product.marketplace.name,
      product.categoryRef?.name || product.category,
      offer?.affiliateUrl,
      offer?.currentPrice ? `preco ${offer.currentPrice}` : ""
    ]
      .filter(Boolean)
      .join("\n");
    indexed += await upsertVectorDocument("product", product.id, content, {
      marketplace: product.marketplace.name,
      category: product.categoryRef?.name || product.category
    });
  }
  for (const content of contents) {
    indexed += await upsertVectorDocument("generated_content", content.id, `${content.title}\n${content.content}`, {
      channel: content.channel,
      tone: content.tone
    });
  }
  for (const page of seoPages) {
    indexed += await upsertVectorDocument("seo_page", page.id, `${page.tituloSeo}\n${page.metaDescription ?? ""}\n${page.conteudo ?? ""}`, {
      tipo: page.tipo,
      status: page.status
    });
  }
  return { indexed };
}

export async function searchVectorMemory(query: string, limit = 8) {
  const queryEmbedding = buildEmbedding(query);
  const docs = await prisma.vectorDocument.findMany({ orderBy: { createdAt: "desc" }, take: 500 });
  return docs
    .map((doc) => ({
      ...doc,
      similarity: cosineSimilarity(queryEmbedding, Array.isArray(doc.embedding) ? (doc.embedding as number[]) : [])
    }))
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);
}

export async function auditAiCosts() {
  const policy = await getAutonomyPolicy();
  const today = startOfToday();
  const costs = await prisma.aiCostControl.findMany({ where: { createdAt: { gte: today } } });
  const total = costs.reduce((sum, item) => sum + (toNumber(item.estimatedCost) ?? 0), 0);
  const limit = toNumber(policy.dailyAiCostLimit) ?? 5;
  if (total >= limit * 0.8) {
    await upsertRecommendation({
      productId: undefined,
      type: "controlar_custo_ia",
      title: "Custo de IA perto do limite diario",
      description: `Uso estimado em ${formatMoney(total)} de ${formatMoney(limit)}.`,
      priority: total >= limit ? "critica" : "alta",
      confidence: 95,
      agentName: "analytics",
      metadata: { total, limit }
    });
  }
  return { total: roundCost(total), limit, status: total >= limit ? "blocked" : "ok" };
}

async function dispatchAgent(agent: AgentName, input: Record<string, unknown>, policy: Awaited<ReturnType<typeof getAutonomyPolicy>>) {
  if (agent === "scout") return runScoutAgent(input, policy);
  if (agent === "content") return runContentAgent(input);
  if (agent === "seo") return runSeoAgent(input);
  if (agent === "creative") return runCreativeAgent(input);
  if (agent === "publisher") return runPublisherAgent(input, policy);
  if (agent === "analytics") return runAnalyticsAgent(input);
  if (agent === "affiliate") return runAffiliateAgent(input);
  if (agent === "vector-indexing") return indexVectorDocuments(numberValue(input.limit) ?? 100);
  throw new Error("Agente nao suportado.");
}

async function runScoutAgent(input: Record<string, unknown>, policy: Awaited<ReturnType<typeof getAutonomyPolicy>>) {
  const limit = numberValue(input.limit) ?? 20;
  const minScore = toNumber(policy.minScore) ?? 75;
  const offers = await prisma.offer.findMany({
    where: { affiliateUrl: { not: null }, score: { gte: Math.max(minScore - 15, 50) } },
    include: {
      product: { include: { categoryRef: true, priceHistory: { orderBy: { dataColeta: "desc" }, take: 1 } } },
      marketplace: true
    },
    orderBy: [{ score: "desc" }, { createdAt: "desc" }],
    take: limit
  });
  const recommendations = [];
  for (const offer of offers) {
    const score = toNumber(offer.score) ?? 0;
    const decision = score >= minScore ? "divulgar" : "aguardar";
    const channelPlan = chooseChannelAndTime({
      title: offer.product.title,
      category: offer.product.categoryRef?.name || offer.product.category,
      imageUrl: offer.product.imageUrl,
      score,
      allowedChannels: policy.allowedChannels.length ? policy.allowedChannels : DEFAULT_ALLOWED_CHANNELS
    });
    recommendations.push(
      await upsertRecommendation({
        productId: offer.productId,
        type: decision === "divulgar" ? "divulgar_produto" : "republicar",
        title: `${decision === "divulgar" ? "Divulgar agora" : "Monitorar"}: ${offer.product.title}`,
        description: `Score ${Math.round(score)} em ${offer.marketplace.name}. ${channelPlan.reason}`,
        priority: score >= 90 ? "critica" : score >= minScore ? "alta" : "media",
        confidence: clamp(score, 55, 96),
        agentName: "scout",
        metadata: {
          decision,
          risk: score >= minScore ? "baixo" : "medio",
          bestChannel: channelPlan.channel,
          bestTime: channelPlan.time,
          score,
          marketplace: offer.marketplace.name
        }
      })
    );
  }
  return { scanned: offers.length, recommendations };
}

async function runContentAgent(input: Record<string, unknown>) {
  const offer = await resolveOffer(input);
  if (!offer) throw new Error("Nenhuma oferta encontrada para Content AI.");
  const variations = [
    `Oferta direta: ${offer.product.title}\n${priceLine(offer)}\nComprar: ${offer.affiliateUrl || offer.originalUrl}`,
    `Achado do dia: ${offer.product.title}\n${couponLine(offer)}\nLink afiliado: ${offer.affiliateUrl || offer.originalUrl}`,
    `${offer.product.title} vale conferir agora.\n${priceLine(offer)}\nPreco e estoque podem mudar sem aviso.`
  ];
  const recommendation = await upsertRecommendation({
    productId: offer.productId,
    type: "melhorar_conteudo",
    title: `Gerar variacoes de conteudo: ${offer.product.title}`,
    description: "Content AI criou variacoes para testar linguagem por canal.",
    priority: "media",
    confidence: 82,
    agentName: "content",
    metadata: { variations, channels: ["WHATSAPP", "TELEGRAM", "INSTAGRAM", "FACEBOOK", "NEWSLETTER"] }
  });
  return { offerId: offer.id, variations, recommendation };
}

async function runSeoAgent(input: Record<string, unknown>) {
  const limit = numberValue(input.limit) ?? 10;
  const offers = await prisma.offer.findMany({
    where: { score: { gte: 75 }, affiliateUrl: { not: null } },
    include: { product: { include: { seoPages: true, categoryRef: true } }, marketplace: true },
    orderBy: [{ score: "desc" }, { createdAt: "desc" }],
    take: limit
  });
  const recommendations = [];
  for (const offer of offers) {
    if (offer.product.seoPages.length) continue;
    recommendations.push(
      await upsertRecommendation({
        productId: offer.productId,
        type: "gerar_seo",
        title: `${offer.product.title} vale a pena?`,
        description: `Produto com score ${Number(offer.score ?? 0).toFixed(0)} deve virar pagina SEO.`,
        priority: Number(offer.score ?? 0) >= 90 ? "alta" : "media",
        confidence: clamp(Number(offer.score ?? 0), 65, 94),
        agentName: "seo",
        metadata: {
          seoType: "review",
          keyword: `${offer.product.title} vale a pena`,
          category: offer.product.categoryRef?.name || offer.product.category
        }
      })
    );
  }
  return { analyzed: offers.length, recommendations };
}

async function runCreativeAgent(input: Record<string, unknown>) {
  const productId = stringValue(input.productId);
  const product = productId
    ? await prisma.product.findFirst({ where: { id: productId, deletedAt: null }, include: { offers: { take: 1 } } })
    : (
        await prisma.offer.findFirst({
          where: { affiliateUrl: { not: null }, score: { gte: 75 } },
          include: { product: { include: { offers: { take: 1 } } } },
          orderBy: [{ score: "desc" }, { createdAt: "desc" }]
        })
      )?.product;
  if (!product) throw new Error("Nenhum produto encontrado para Creative AI.");
  const recommendation = await upsertRecommendation({
    productId: product.id,
    type: "gerar_criativo",
    title: `Criar criativo para ${product.title}`,
    description: "Creative AI recomenda gerar feed 1080x1080 e story 1080x1920.",
    priority: "alta",
    confidence: 84,
    agentName: "creative",
    metadata: {
      format: "IMAGE",
      bestChannel: product.imageUrl ? "INSTAGRAM" : "FACEBOOK",
      prompt: `Criativo limpo e persuasivo para ${product.title}, foco em oferta de afiliado.`
    }
  });
  return { productId: product.id, recommendation };
}

async function runPublisherAgent(input: Record<string, unknown>, policy: Awaited<ReturnType<typeof getAutonomyPolicy>>) {
  const limit = numberValue(input.limit) ?? 10;
  const minScore = toNumber(policy.minScore) ?? 75;
  const offers = await prisma.offer.findMany({
    where: { affiliateUrl: { not: null }, score: { gte: minScore } },
    include: { product: { include: { categoryRef: true } }, marketplace: true },
    orderBy: [{ score: "desc" }, { createdAt: "desc" }],
    take: limit
  });
  const dailyCount = await prisma.publicationSchedule.count({ where: { createdAt: { gte: startOfToday() } } });
  const recommendations = [];
  const scheduled = [];
  for (const offer of offers) {
    const channelPlan = chooseChannelAndTime({
      title: offer.product.title,
      category: offer.product.categoryRef?.name || offer.product.category,
      imageUrl: offer.product.imageUrl,
      score: toNumber(offer.score) ?? 0,
      allowedChannels: policy.allowedChannels.length ? policy.allowedChannels : DEFAULT_ALLOWED_CHANNELS
    });
    const recommendation = await upsertRecommendation({
      productId: offer.productId,
      type: "trocar_horario",
      title: `Publicar ${offer.product.title} as ${channelPlan.time}`,
      description: channelPlan.reason,
      priority: "alta",
      confidence: 86,
      agentName: "publisher",
      metadata: {
        bestChannel: channelPlan.channel,
        bestTime: channelPlan.time,
        requiresApproval: policy.mode === "manual",
        minScore
      }
    });
    recommendations.push(recommendation);

    if (canAutoPublish(policy.mode) && dailyCount + scheduled.length < policy.dailyPublicationLimit) {
      scheduled.push(
        await createPublicationSchedule({
          offerId: offer.id,
          channel: channelFromValue(channelPlan.channel),
          scheduledAt: nextDateAtTime(channelPlan.time),
          metadata: { agent: "publisher", recommendationId: recommendation.id }
        })
      );
    }
  }
  return { analyzed: offers.length, recommendations, scheduled };
}

async function runAnalyticsAgent(input: Record<string, unknown>) {
  await syncPerformanceMetrics();
  const overview = await getAnalyticsOverview();
  const recommendations = [];
  if (overview.cards.bestHour !== "-") {
    recommendations.push(
      await upsertRecommendation({
        productId: undefined,
        type: "trocar_horario",
        title: `Priorizar publicacoes as ${overview.cards.bestHour}`,
        description: "Analytics AI identificou melhor janela a partir do historico de publicacoes.",
        priority: "media",
        confidence: 80,
        agentName: "analytics",
        metadata: { bestHour: overview.cards.bestHour }
      })
    );
  }
  const lowProducts = await prisma.performanceMetric.groupBy({
    by: ["productId"],
    _sum: { clicks: true, impressions: true },
    where: { productId: { not: null } },
    orderBy: { _sum: { impressions: "desc" } },
    take: numberValue(input.limit) ?? 10
  });
  for (const item of lowProducts) {
    const impressions = item._sum.impressions ?? 0;
    const clicks = item._sum.clicks ?? 0;
    if (impressions >= 100 && clicks / impressions < 0.01 && item.productId) {
      recommendations.push(
        await upsertRecommendation({
          productId: item.productId,
          type: "pausar_produto",
          title: "Pausar produto com baixo CTR",
          description: `Produto com ${clicks} cliques em ${impressions} impressoes estimadas.`,
          priority: "media",
          confidence: 74,
          agentName: "analytics",
          metadata: { clicks, impressions, ctr: impressions ? clicks / impressions : 0 }
        })
      );
    }
  }
  return { overview: overview.cards, recommendations };
}

async function runAffiliateAgent(input: Record<string, unknown>) {
  const limit = numberValue(input.limit) ?? 20;
  const products = await prisma.product.findMany({
    where: { deletedAt: null, offers: { some: { affiliateUrl: { not: null } } } },
    include: { offers: { include: { marketplace: true }, orderBy: [{ score: "desc" }, { currentPrice: "asc" }] } },
    take: limit
  });
  const recommendations = [];
  for (const product of products) {
    if (product.offers.length < 2) continue;
    const best = product.offers
      .filter((offer) => offer.affiliateUrl)
      .sort((a, b) => {
        const commissionDiff = (toNumber(b.commissionPercent) ?? 0) - (toNumber(a.commissionPercent) ?? 0);
        if (commissionDiff !== 0) return commissionDiff;
        return (toNumber(a.currentPrice) ?? Number.MAX_SAFE_INTEGER) - (toNumber(b.currentPrice) ?? Number.MAX_SAFE_INTEGER);
      })[0];
    if (!best) continue;
    recommendations.push(
      await upsertRecommendation({
        productId: product.id,
        type: "priorizar_marketplace",
        title: `Priorizar ${best.marketplace.name} para ${product.title}`,
        description: "Affiliate AI comparou preco, comissao e score entre ofertas do produto.",
        priority: "media",
        confidence: 78,
        agentName: "affiliate",
        metadata: {
          marketplace: best.marketplace.name,
          commissionPercent: toNumber(best.commissionPercent),
          currentPrice: toNumber(best.currentPrice),
          score: toNumber(best.score)
        }
      })
    );
  }
  return { analyzed: products.length, recommendations };
}

async function upsertRecommendation(input: {
  productId?: string;
  type: string;
  title: string;
  description: string;
  priority: string;
  confidence: number;
  agentName: string;
  metadata?: Record<string, unknown>;
}) {
  const existing = await prisma.aiRecommendation.findFirst({
    where: {
      productId: input.productId,
      recommendationType: input.type,
      status: "pending"
    }
  });
  const data = {
    productId: input.productId,
    recommendationType: input.type,
    title: input.title,
    description: input.description,
    priority: input.priority,
    confidence: roundMetric(input.confidence),
    agentName: input.agentName,
    metadata: jsonInput(input.metadata ?? {})
  };
  if (existing) return prisma.aiRecommendation.update({ where: { id: existing.id }, data });
  return prisma.aiRecommendation.create({ data });
}

async function resolveOffer(input: Record<string, unknown>) {
  const offerId = stringValue(input.offerId);
  if (offerId) {
    return prisma.offer.findUnique({ where: { id: offerId }, include: { product: true, marketplace: true } });
  }
  const productId = stringValue(input.productId);
  if (productId) {
    return prisma.offer.findFirst({
      where: { productId, affiliateUrl: { not: null } },
      include: { product: true, marketplace: true },
      orderBy: [{ score: "desc" }, { createdAt: "desc" }]
    });
  }
  return prisma.offer.findFirst({
    where: { affiliateUrl: { not: null } },
    include: { product: true, marketplace: true },
    orderBy: [{ score: "desc" }, { createdAt: "desc" }]
  });
}

function normalizeAgentName(value: string): AgentName {
  const normalized = value.trim().toLowerCase();
  if ((AGENTS as readonly string[]).includes(normalized)) return normalized as AgentName;
  throw new Error(`Agente invalido: ${value}.`);
}

async function assertAiCostBudget(policy: Awaited<ReturnType<typeof getAutonomyPolicy>>) {
  const today = startOfToday();
  const result = await prisma.aiCostControl.aggregate({
    where: { createdAt: { gte: today } },
    _sum: { estimatedCost: true }
  });
  const used = toNumber(result._sum.estimatedCost) ?? 0;
  const limit = toNumber(policy.dailyAiCostLimit) ?? 5;
  if (used >= limit) {
    throw new Error(`Limite diario de custo de IA atingido (${formatMoney(used)} de ${formatMoney(limit)}).`);
  }
}

function estimateUsage(input: unknown, output: unknown) {
  const tokensInput = Math.max(1, Math.ceil(JSON.stringify(input ?? {}).length / 4));
  const tokensOutput = Math.max(1, Math.ceil(JSON.stringify(output ?? {}).length / 4));
  return {
    tokensInput,
    tokensOutput,
    estimatedCost: roundCost((tokensInput + tokensOutput) * 0.000002)
  };
}

function chooseChannelAndTime(input: {
  title: string;
  category?: string | null;
  imageUrl?: string | null;
  score: number;
  allowedChannels: string[];
}) {
  const category = input.category?.toLowerCase() ?? "";
  const allowed = input.allowedChannels.length ? input.allowedChannels : DEFAULT_ALLOWED_CHANNELS;
  let channel = allowed.includes("WHATSAPP") && /fitness|suplement|moda|beleza/.test(category) ? "WHATSAPP" : "";
  if (!channel && input.imageUrl && allowed.includes("INSTAGRAM")) channel = "INSTAGRAM";
  if (!channel && input.score >= 90 && allowed.includes("TELEGRAM")) channel = "TELEGRAM";
  if (!channel && allowed.includes("FACEBOOK")) channel = "FACEBOOK";
  if (!channel) channel = allowed[0] || "TELEGRAM";
  const time = /fitness|suplement/.test(category) ? "20:00" : channel === "INSTAGRAM" ? "19:30" : "12:00";
  return {
    channel,
    time,
    reason: `Canal ${channel} sugerido para ${input.category || "categoria geral"} no horario ${time}.`
  };
}

function channelFromValue(value: string): Channel {
  if (value === "WHATSAPP") return Channel.WHATSAPP;
  if (value === "INSTAGRAM") return Channel.INSTAGRAM;
  if (value === "FACEBOOK") return Channel.FACEBOOK;
  if (value === "MANUAL") return Channel.MANUAL;
  return Channel.TELEGRAM;
}

function dateFromRecommendation(metadata: Record<string, unknown>) {
  return nextDateAtTime(stringValue(metadata.bestTime) || stringValue(metadata.bestHour) || "20:00");
}

function nextDateAtTime(value: string) {
  const match = value.match(/^(\d{2}):(\d{2})/);
  const result = new Date();
  const hours = match ? Number(match[1]) : 20;
  const minutes = match ? Number(match[2]) : 0;
  result.setHours(hours, minutes, 0, 0);
  if (result <= new Date()) result.setDate(result.getDate() + 1);
  return result;
}

function canAutoPublish(mode: string) {
  return mode === "semi_autonomo" || mode === "autonomo_controlado";
}

function summarizeExecution(result: unknown) {
  if (!result || typeof result !== "object") return result;
  if ("id" in result && typeof result.id === "string") return { id: result.id };
  return { ok: true };
}

async function upsertVectorDocument(entityType: string, entityId: string, content: string, metadata: Record<string, unknown>) {
  await prisma.vectorDocument.deleteMany({ where: { entityType, entityId } });
  await prisma.vectorDocument.create({
    data: {
      entityType,
      entityId,
      content,
      metadata: jsonInput(metadata),
      embedding: jsonInput(buildEmbedding(content))
    }
  });
  return 1;
}

function buildEmbedding(content: string) {
  const vector = new Array(1536).fill(0) as number[];
  const words = content
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  for (const word of words) {
    const index = hashWord(word) % vector.length;
    vector[index] = (vector[index] ?? 0) + 1;
  }
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1;
  return vector.map((value) => Number((value / norm).toFixed(6)));
}

function hashWord(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return Math.abs(hash >>> 0);
}

function cosineSimilarity(a: number[], b: number[]) {
  if (!a.length || !b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let index = 0; index < Math.min(a.length, b.length); index += 1) {
    dot += a[index]! * b[index]!;
    normA += a[index]! * a[index]!;
    normB += b[index]! * b[index]!;
  }
  return normA && normB ? dot / (Math.sqrt(normA) * Math.sqrt(normB)) : 0;
}

function groupMetrics<T extends { clicks: number; impressions: number; conversions: number; commission: unknown }>(
  metrics: T[],
  keyFn: (item: T) => string
) {
  const map = new Map<string, { key: string; clicks: number; impressions: number; conversions: number; commission: number; ctr: number }>();
  for (const item of metrics) {
    const key = keyFn(item);
    const current = map.get(key) ?? { key, clicks: 0, impressions: 0, conversions: 0, commission: 0, ctr: 0 };
    current.clicks += item.clicks;
    current.impressions += item.impressions;
    current.conversions += item.conversions;
    current.commission += toNumber(item.commission) ?? 0;
    current.ctr = current.impressions ? roundMetric((current.clicks / current.impressions) * 100) : 0;
    map.set(key, current);
  }
  return [...map.values()].sort((a, b) => b.clicks - a.clicks);
}

function pickBest<T extends { clicks: number }>(items: T[]) {
  return items[0];
}

async function findBestHour() {
  const schedules = await prisma.publicationSchedule.findMany({
    where: { status: "PUBLISHED", publishedAt: { not: null } },
    take: 500,
    orderBy: { publishedAt: "desc" }
  });
  if (!schedules.length) return "-";
  const counts = new Map<number, number>();
  for (const schedule of schedules) {
    const hour = schedule.publishedAt?.getHours() ?? schedule.scheduledAt?.getHours() ?? 20;
    counts.set(hour, (counts.get(hour) ?? 0) + 1);
  }
  const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  return best === undefined ? "-" : `${String(best).padStart(2, "0")}:00`;
}

function priceLine(offer: NonNullable<Awaited<ReturnType<typeof resolveOffer>>>) {
  const current = toNumber(offer.currentPrice);
  const old = toNumber(offer.oldPrice);
  const discount = toNumber(offer.discountPercent);
  const parts = [];
  if (old) parts.push(`De ${formatMoney(old)}`);
  if (current) parts.push(`por ${formatMoney(current)}`);
  if (discount) parts.push(`${Math.round(discount)}% OFF`);
  return parts.join(" | ");
}

function couponLine(offer: NonNullable<Awaited<ReturnType<typeof resolveOffer>>>) {
  return offer.couponCode ? `Cupom ${offer.couponCode}` : "Confira o cupom disponivel antes de finalizar.";
}

function truncateDate(date: Date) {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

function startOfToday() {
  return truncateDate(new Date());
}

function average(values: number[]) {
  const clean = values.filter((value) => Number.isFinite(value));
  return clean.length ? clean.reduce((sum, value) => sum + value, 0) / clean.length : 0;
}

function numberValue(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function roundMetric(value: number) {
  return Math.round(value * 100) / 100;
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function roundCost(value: number) {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function roundPrediction(value: number) {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}
