import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import authRoutes from "./auth.js";
import marketplaceRoutes from "./marketplaces.js";
import affiliateAccountRoutes from "./affiliate-accounts.js";
import offerRoutes from "./offers.js";
import messageTemplateRoutes from "./message-templates.js";
import campaignRoutes from "./campaigns.js";
import scheduledPostRoutes from "./scheduled-posts.js";
import channelRoutes from "./channels.js";
import reportRoutes from "./reports.js";

const router = Router();

router.use("/auth", authRoutes);
router.use("/marketplaces", requireAuth, marketplaceRoutes);
router.use("/affiliate-accounts", requireAuth, affiliateAccountRoutes);
router.use("/offers", requireAuth, offerRoutes);
router.use("/message-templates", requireAuth, messageTemplateRoutes);
router.use("/campaigns", requireAuth, campaignRoutes);
router.use("/scheduled-posts", requireAuth, scheduledPostRoutes);
router.use("/channels", requireAuth, channelRoutes);
router.use("/reports", requireAuth, reportRoutes);

export default router;
