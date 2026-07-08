import { Router } from "express";
import { z } from "zod";
import { recordAudit } from "../lib/audit.js";
import { asyncHandler, HttpError } from "../lib/http.js";
import { prisma } from "../lib/prisma.js";
import { getAutonomyPolicy, listAgentNames, runAgent, updateAutonomyPolicy } from "../services/agents.js";

const router = Router();

router.get(
  "/",
  asyncHandler(async (_req, res) => {
    res.json({ agents: listAgentNames() });
  })
);

router.get(
  "/policy",
  asyncHandler(async (_req, res) => {
    res.json(await getAutonomyPolicy());
  })
);

router.put(
  "/policy",
  asyncHandler(async (req, res) => {
    const data = z
      .object({
        mode: z.enum(["manual", "assistido", "semi_autonomo", "autonomo_controlado"]).optional(),
        dailyPublicationLimit: z.coerce.number().int().min(1).max(500).optional(),
        allowedChannels: z.array(z.string()).optional(),
        minScore: z.coerce.number().min(0).max(100).optional(),
        minCommission: z.coerce.number().min(0).optional().nullable(),
        startTime: z.string().regex(/^\d{2}:\d{2}$/).optional().nullable(),
        endTime: z.string().regex(/^\d{2}:\d{2}$/).optional().nullable(),
        requireCoupon: z.boolean().optional(),
        dailyAiCostLimit: z.coerce.number().min(0).max(1000).optional()
      })
      .parse(req.body ?? {});
    const policy = await updateAutonomyPolicy(data);
    await recordAudit(req, { entity: "AutonomyPolicy", entityId: policy.id, action: "update", after: policy });
    res.json(policy);
  })
);

router.get(
  "/runs",
  asyncHandler(async (_req, res) => {
    const runs = await prisma.agentRun.findMany({
      orderBy: { createdAt: "desc" },
      take: 200
    });
    res.json(runs);
  })
);

router.get(
  "/runs/:id",
  asyncHandler(async (req, res) => {
    const run = await prisma.agentRun.findUnique({ where: { id: req.params.id } });
    if (!run) throw new HttpError(404, "Execucao de agente nao encontrada.");
    res.json(run);
  })
);

router.post(
  "/:agent/run",
  asyncHandler(async (req, res) => {
    const input = z.record(z.unknown()).default({}).parse(req.body ?? {});
    const run = await runAgent(req.params.agent!, input, req.user?.id);
    await recordAudit(req, { entity: "AgentRun", entityId: run.id, action: "run", after: run });
    res.status(201).json(run);
  })
);

export default router;
