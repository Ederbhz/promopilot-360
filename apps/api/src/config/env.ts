import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  APP_ENV: z.string().default("development"),
  APP_URL: z.string().url().default("http://localhost:3000"),
  API_URL: z.string().url().default("http://localhost:4000"),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z
    .string()
    .min(1)
    .default("postgresql://promopilot:promopilot@localhost:5432/promopilot360"),
  REDIS_HOST: z.string().default("localhost"),
  REDIS_PORT: z.coerce.number().default(6379),
  REDIS_URL: z.string().optional(),
  CORS_ALLOWED_ORIGINS: z.string().optional(),
  JWT_SECRET: z.string().min(16).default("dev_only_change_this_secret"),
  ENCRYPTION_KEY: z.string().min(16).default("dev_only_change_this_encryption_key"),
  AWIN_API_TOKEN: z.string().optional(),
  AWIN_PUBLISHER_ID: z.string().optional(),
  AWIN_NATURA_ADVERTISER_ID: z.string().optional(),
  SHOPEE_APP_ID: z.string().optional(),
  SHOPEE_APP_SECRET: z.string().optional(),
  SHOPEE_AFFILIATE_ID: z.string().optional(),
  SHOPEE_API_BASE_URL: z.string().optional(),
  SHOPEE_SUB_IDS: z.string().optional(),
  MELI_CLIENT_ID: z.string().optional(),
  MELI_CLIENT_SECRET: z.string().optional(),
  MELI_REDIRECT_URI: z.string().optional(),
  MELI_ACCESS_TOKEN: z.string().optional(),
  MELI_REFRESH_TOKEN: z.string().optional(),
  MELI_AFFILIATE_TAG: z.string().optional(),
  MELI_AFFILIATE_COOKIE: z.string().optional(),
  MELI_CSRF_TOKEN: z.string().optional(),
  MAGALU_STORE_URL: z.string().optional(),
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_DEFAULT_CHAT_ID: z.string().optional(),
  WHATSAPP_GRAPH_VERSION: z.string().default("v23.0"),
  WPP_SERVER_URL: z.string().url().optional(),
  WPP_SERVER_HOSTNAME: z.string().optional(),
  WPP_SESSION_NAME: z.string().default("promopilot360"),
  WPP_SECRET_KEY: z.string().optional(),
  WHATSAPP_DEFAULT_INTERVAL_SECONDS: z.coerce.number().int().min(10).default(60),
  WHATSAPP_DAILY_LIMIT: z.coerce.number().int().min(1).default(100),
  WHATSAPP_MAX_CONSECUTIVE_FAILURES: z.coerce.number().int().min(1).default(5),
  SHORT_LINK_DOMAIN: z.string().default("http://localhost:4000/r"),
  DISABLE_WORKERS: z.string().optional()
});

export const env = envSchema.parse(process.env);
