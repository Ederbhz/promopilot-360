import { Queue, Worker } from "bullmq";
import { env } from "../config/env.js";
import { processDuePublicationSchedules, retryFailedPublicationSchedules } from "../services/automation.js";
import { auditAiCosts, indexVectorDocuments, runAgent, trainMlModel } from "../services/agents.js";
import { runIntelligenceJobs } from "../services/intelligence.js";
import { processDueScheduledPosts } from "../services/scheduler.js";

export const queueNames = {
  offerSearch: "offer-search-queue",
  affiliateLink: "affiliate-link-queue",
  offerValidation: "offer-validation-queue",
  scheduledPosts: "scheduled-posts-queue",
  telegramSend: "telegram-send-queue",
  analytics: "analytics-queue",
  priceAnalysis: "price-analysis-queue",
  scoreCalculation: "score-calculation-queue",
  couponValidation: "coupon-validation-queue",
  seoGeneration: "seo-generation-queue",
  aiContent: "ai-content-queue",
  publishQueue: "publish-queue",
  retryPublication: "retry-publication",
  imageGeneration: "image-generation",
  newsletterSend: "newsletter-send",
  agentScout: "agent-scout-queue",
  agentContent: "agent-content-queue",
  agentSeo: "agent-seo-queue",
  agentCreative: "agent-creative-queue",
  agentPublisher: "agent-publisher-queue",
  agentAnalytics: "agent-analytics-queue",
  mlTraining: "ml-training-queue",
  mlPrediction: "ml-prediction-queue",
  vectorIndexing: "vector-indexing-queue",
  aiCostAudit: "ai-cost-audit-queue"
} as const;

export async function startBullMqScheduler() {
  const connection = buildRedisConnection();

  const scheduledPostsQueue = new Queue(queueNames.scheduledPosts, { connection });
  const intelligenceQueue = new Queue(queueNames.priceAnalysis, { connection });
  const publishQueue = new Queue(queueNames.publishQueue, { connection });
  const retryPublicationQueue = new Queue(queueNames.retryPublication, { connection });
  const scoutQueue = new Queue(queueNames.agentScout, { connection });
  const analyticsQueue = new Queue(queueNames.agentAnalytics, { connection });
  const mlTrainingQueue = new Queue(queueNames.mlTraining, { connection });
  const vectorIndexingQueue = new Queue(queueNames.vectorIndexing, { connection });
  const aiCostAuditQueue = new Queue(queueNames.aiCostAudit, { connection });
  const worker = new Worker(
    queueNames.scheduledPosts,
    async () => {
      await processDueScheduledPosts();
    },
    { connection }
  );
  const intelligenceWorker = new Worker(
    queueNames.priceAnalysis,
    async () => {
      await runIntelligenceJobs(100);
    },
    { connection }
  );
  const publishWorker = new Worker(
    queueNames.publishQueue,
    async () => {
      await processDuePublicationSchedules();
    },
    { connection }
  );
  const retryPublicationWorker = new Worker(
    queueNames.retryPublication,
    async () => {
      await retryFailedPublicationSchedules();
    },
    { connection }
  );
  const scoutWorker = new Worker(
    queueNames.agentScout,
    async () => {
      await runAgent("scout", { limit: 50, source: "job_daily_opportunity_scan" });
    },
    { connection }
  );
  const analyticsWorker = new Worker(
    queueNames.agentAnalytics,
    async () => {
      await runAgent("analytics", { source: "job_hourly_analytics_review" });
    },
    { connection }
  );
  const mlTrainingWorker = new Worker(
    queueNames.mlTraining,
    async () => {
      await trainMlModel();
    },
    { connection }
  );
  const vectorIndexingWorker = new Worker(
    queueNames.vectorIndexing,
    async () => {
      await indexVectorDocuments(200);
    },
    { connection }
  );
  const aiCostAuditWorker = new Worker(
    queueNames.aiCostAudit,
    async () => {
      await auditAiCosts();
    },
    { connection }
  );

  const interval = setInterval(() => {
    scheduledPostsQueue
      .add("processScheduledPosts", {}, { removeOnComplete: true, removeOnFail: 50 })
      .catch((error) => console.warn("Falha ao enfileirar processScheduledPosts:", error));
  }, 60_000);
  const intelligenceInterval = setInterval(() => {
    intelligenceQueue
      .add("runIntelligenceJobs", {}, { removeOnComplete: true, removeOnFail: 50 })
      .catch((error) => console.warn("Falha ao enfileirar runIntelligenceJobs:", error));
  }, 6 * 60 * 60_000);
  const publishInterval = setInterval(() => {
    publishQueue
      .add("publishDueSchedules", {}, { removeOnComplete: true, removeOnFail: 50 })
      .catch((error) => console.warn("Falha ao enfileirar publishDueSchedules:", error));
  }, 60_000);
  const retryInterval = setInterval(() => {
    retryPublicationQueue
      .add("retryFailedSchedules", {}, { removeOnComplete: true, removeOnFail: 50 })
      .catch((error) => console.warn("Falha ao enfileirar retryFailedSchedules:", error));
  }, 5 * 60_000);
  const scoutInterval = setInterval(() => {
    scoutQueue
      .add("dailyOpportunityScan", {}, { removeOnComplete: true, removeOnFail: 50 })
      .catch((error) => console.warn("Falha ao enfileirar dailyOpportunityScan:", error));
  }, 24 * 60 * 60_000);
  const analyticsInterval = setInterval(() => {
    analyticsQueue
      .add("hourlyAnalyticsReview", {}, { removeOnComplete: true, removeOnFail: 50 })
      .catch((error) => console.warn("Falha ao enfileirar hourlyAnalyticsReview:", error));
  }, 60 * 60_000);
  const mlTrainingInterval = setInterval(() => {
    mlTrainingQueue
      .add("mlTraining", {}, { removeOnComplete: true, removeOnFail: 50 })
      .catch((error) => console.warn("Falha ao enfileirar mlTraining:", error));
  }, 24 * 60 * 60_000);
  const vectorIndexingInterval = setInterval(() => {
    vectorIndexingQueue
      .add("vectorIndexing", {}, { removeOnComplete: true, removeOnFail: 50 })
      .catch((error) => console.warn("Falha ao enfileirar vectorIndexing:", error));
  }, 24 * 60 * 60_000);
  const aiCostAuditInterval = setInterval(() => {
    aiCostAuditQueue
      .add("aiCostAudit", {}, { removeOnComplete: true, removeOnFail: 50 })
      .catch((error) => console.warn("Falha ao enfileirar aiCostAudit:", error));
  }, 60 * 60_000);

  return {
    queue: scheduledPostsQueue,
    intelligenceQueue,
    publishQueue,
    retryPublicationQueue,
    scoutQueue,
    analyticsQueue,
    mlTrainingQueue,
    vectorIndexingQueue,
    aiCostAuditQueue,
    worker,
    intelligenceWorker,
    publishWorker,
    retryPublicationWorker,
    scoutWorker,
    analyticsWorker,
    mlTrainingWorker,
    vectorIndexingWorker,
    aiCostAuditWorker,
    async close() {
      clearInterval(interval);
      clearInterval(intelligenceInterval);
      clearInterval(publishInterval);
      clearInterval(retryInterval);
      clearInterval(scoutInterval);
      clearInterval(analyticsInterval);
      clearInterval(mlTrainingInterval);
      clearInterval(vectorIndexingInterval);
      clearInterval(aiCostAuditInterval);
      await worker.close();
      await intelligenceWorker.close();
      await publishWorker.close();
      await retryPublicationWorker.close();
      await scoutWorker.close();
      await analyticsWorker.close();
      await mlTrainingWorker.close();
      await vectorIndexingWorker.close();
      await aiCostAuditWorker.close();
      await scheduledPostsQueue.close();
      await intelligenceQueue.close();
      await publishQueue.close();
      await retryPublicationQueue.close();
      await scoutQueue.close();
      await analyticsQueue.close();
      await mlTrainingQueue.close();
      await vectorIndexingQueue.close();
      await aiCostAuditQueue.close();
    }
  };
}

function buildRedisConnection() {
  if (!env.REDIS_URL) {
    return {
      host: env.REDIS_HOST,
      port: env.REDIS_PORT,
      maxRetriesPerRequest: null
    };
  }

  const url = new URL(env.REDIS_URL);
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    username: url.username || undefined,
    password: url.password || undefined,
    tls: url.protocol === "rediss:" ? {} : undefined,
    maxRetriesPerRequest: null
  };
}
