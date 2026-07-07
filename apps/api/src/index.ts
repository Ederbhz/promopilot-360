import cors from "cors";
import express from "express";
import helmet from "helmet";
import { pinoHttp } from "pino-http";
import { ZodError } from "zod";
import { env } from "./config/env.js";
import { HttpError } from "./lib/http.js";
import { prisma } from "./lib/prisma.js";
import apiRoutes from "./routes/index.js";
import shortLinkRoutes from "./routes/short-links.js";
import { runIntelligenceJobs } from "./services/intelligence.js";
import { processDueScheduledPosts } from "./services/scheduler.js";
import { startBullMqScheduler } from "./workers/queues.js";

const app = express();

app.use(helmet());
app.use(
  cors({
    origin: resolveCorsOrigins(),
    credentials: true
  })
);
app.use(express.json({ limit: "2mb" }));
app.use(pinoHttp({ redact: ["req.headers.authorization", "req.body.password", "req.body.credentials"] }));

app.get("/health", (_req, res) => {
  res.json({ ok: true, app: "PromoPilot 360", env: env.APP_ENV });
});

app.use("/r", shortLinkRoutes);
app.use(apiRoutes);

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (error instanceof ZodError) {
    res.status(400).json({
      error: "Validacao falhou.",
      details: error.flatten()
    });
    return;
  }

  if (error instanceof HttpError) {
    res.status(error.status).json({ error: error.message });
    return;
  }

  const message = error instanceof Error ? error.message : "Erro interno.";
  reqLogger(error);
  res.status(500).json({ error: message });
});

const server = app.listen(env.PORT, () => {
  console.log(`PromoPilot 360 API rodando em http://localhost:${env.PORT}`);
});

let fallbackInterval: NodeJS.Timeout | null = null;
let intelligenceFallbackInterval: NodeJS.Timeout | null = null;
let bullMqRuntime: Awaited<ReturnType<typeof startBullMqScheduler>> | null = null;

if (env.DISABLE_WORKERS !== "true") {
  startBullMqScheduler()
    .then((runtime) => {
      bullMqRuntime = runtime;
      console.log("BullMQ scheduler ativo.");
    })
    .catch((error) => {
      console.warn("Redis/BullMQ indisponivel; usando loop local de agendamento.", error.message);
      fallbackInterval = setInterval(() => {
        processDueScheduledPosts().catch((err) => {
          console.warn("Falha ao processar publicacoes agendadas:", err);
        });
      }, 60_000);
      intelligenceFallbackInterval = setInterval(() => {
        runIntelligenceJobs(100).catch((err) => {
          console.warn("Falha ao processar jobs de inteligencia:", err);
        });
      }, 6 * 60 * 60_000);
    });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

async function shutdown() {
  if (fallbackInterval) clearInterval(fallbackInterval);
  if (intelligenceFallbackInterval) clearInterval(intelligenceFallbackInterval);
  if (bullMqRuntime) await bullMqRuntime.close();
  server.close();
  await prisma.$disconnect();
  process.exit(0);
}

function reqLogger(error: unknown) {
  console.error(error);
}

function resolveCorsOrigins() {
  const origins = env.CORS_ALLOWED_ORIGINS
    ? env.CORS_ALLOWED_ORIGINS.split(",").map((origin) => origin.trim()).filter(Boolean)
    : [env.APP_URL];

  return origins.map(toCorsOrigin);
}

function toCorsOrigin(value: string) {
  try {
    return new URL(value).origin;
  } catch {
    return value;
  }
}
