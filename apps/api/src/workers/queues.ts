import { Queue, Worker } from "bullmq";
import { env } from "../config/env.js";
import { processDueScheduledPosts } from "../services/scheduler.js";

export const queueNames = {
  offerSearch: "offer-search-queue",
  affiliateLink: "affiliate-link-queue",
  offerValidation: "offer-validation-queue",
  scheduledPosts: "scheduled-posts-queue",
  telegramSend: "telegram-send-queue",
  analytics: "analytics-queue"
} as const;

export async function startBullMqScheduler() {
  const connection = buildRedisConnection();

  const scheduledPostsQueue = new Queue(queueNames.scheduledPosts, { connection });
  const worker = new Worker(
    queueNames.scheduledPosts,
    async () => {
      await processDueScheduledPosts();
    },
    { connection }
  );

  const interval = setInterval(() => {
    scheduledPostsQueue
      .add("processScheduledPosts", {}, { removeOnComplete: true, removeOnFail: 50 })
      .catch((error) => console.warn("Falha ao enfileirar processScheduledPosts:", error));
  }, 60_000);

  return {
    queue: scheduledPostsQueue,
    worker,
    async close() {
      clearInterval(interval);
      await worker.close();
      await scheduledPostsQueue.close();
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
