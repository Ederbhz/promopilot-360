import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../lib/http.js";
import { sendTelegramMessage, testTelegramConnection } from "../services/telegram.js";

const router = Router();

router.post(
  "/telegram/test",
  asyncHandler(async (_req, res) => {
    res.json(await testTelegramConnection());
  })
);

router.post(
  "/telegram/send",
  asyncHandler(async (req, res) => {
    const data = z
      .object({
        chatId: z.string().optional(),
        message: z.string().min(1),
        imageUrl: z.string().url().optional()
      })
      .parse(req.body);
    res.json(await sendTelegramMessage(data));
  })
);

export default router;
