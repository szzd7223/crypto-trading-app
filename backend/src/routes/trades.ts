// ============================================================
// REST Routes — Recent trades
// GET /api/trades?limit=50
// ============================================================

import { Router } from "express";
import type { TradeGenerator } from "../market/generator.js";

export function buildTradesRouter(generator: TradeGenerator): Router {
  const router = Router();

  router.get("/", (req, res) => {
    const limit = parseInt((req.query["limit"] as string) ?? "50", 10);

    if (isNaN(limit) || limit < 1 || limit > 100) {
      res.status(400).json({ error: "limit must be 1–100" });
      return;
    }

    const trades = generator.getRecentTrades().slice(0, limit);
    res.json({ trades });
  });

  return router;
}
