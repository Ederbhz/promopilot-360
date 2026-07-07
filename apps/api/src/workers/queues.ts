import { Queue, Worker } from "bullmq";
import { env } from "../config/env.js";
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
  aiContent: "ai-content-queue"
} as const;

export async function startBullMqScheduler() {
  const connection = buildRedisConnection();

  const scheduledPostsQueue = new Queue(queueNames.scheduledPosts, { connection });
  const intelligenceQueue = new Queue(queueNames.priceAnalysis, { connection });
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

  return {
    queue: scheduledPostsQueue,
    intelligenceQueue,
    worker,
    intelligenceWorker,
    async close() {
      clearInterval(interval);
      clearInterval(intelligenceInterval);
      await worker.close();
      await intelligenceWorker.close();
      await scheduledPostsQueue.close();
      await intelligenceQueue.close();
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
