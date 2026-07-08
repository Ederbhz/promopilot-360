import { Router } from "express";
import { asyncHandler } from "../lib/http.js";
import { getAnalyticsOverview, syncPerformanceMetrics } from "../services/agents.js";

const router = Router();

router.get(
  "/overview",
  asyncHandler(async (_req, res) => {
    res.json(await getAnalyticsOverview());
  })
);

router.post(
  "/sync",
  asyncHandler(async (_req, res) => {
    res.json(await syncPerformanceMetrics());
  })
);

router.get(
  "/channels",
  asyncHandler(async (_req, res) => {
    const overview = await getAnalyticsOverview();
    res.json(overview.channels);
  })
);

router.get(
  "/products",
  asyncHandler(async (_req, res) => {
    const overview = await getAnalyticsOverview();
    res.json(overview.products);
  })
);

router.get(
  "/categories",
  asyncHandler(async (_req, res) => {
    const overview = await getAnalyticsOverview();
    res.json(overview.categories);
  })
);

router.get(
  "/time-performance",
  asyncHandler(async (_req, res) => {
    const overview = await getAnalyticsOverview();
    res.json({ bestHour: overview.cards.bestHour });
  })
);

router.get(
  "/revenue",
  asyncHandler(async (_req, res) => {
    const overview = await getAnalyticsOverview();
    res.json({
      estimatedRevenue: overview.cards.estimatedRevenue,
      estimatedCommission: overview.cards.estimatedCommission,
      estimatedRoi: overview.cards.estimatedRoi
    });
  })
);

export default router;
