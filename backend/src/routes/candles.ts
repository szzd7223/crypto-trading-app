// ============================================================
// REST Routes — Candles history
// GET /api/candles?interval=1m&limit=200
// ============================================================

import { Router } from 'express';
import type { CandleEngine } from '../market/candle-engine.js';
import type { Interval } from '../types.js';

export function buildCandlesRouter(candleEngine: CandleEngine): Router {
  const router = Router();

  router.get('/', (req, res) => {
    const interval = (req.query['interval'] as string) ?? '1m';
    const limit = parseInt((req.query['limit'] as string) ?? '200', 10);

    if (interval !== '1m' && interval !== '5m') {
      res.status(400).json({ error: 'interval must be 1m or 5m' });
      return;
    }

    if (isNaN(limit) || limit < 1 || limit > 500) {
      res.status(400).json({ error: 'limit must be 1–500' });
      return;
    }

    const candles = candleEngine.getHistory(interval as Interval, limit);
    res.json({ interval, candles });
  });

  return router;
}
