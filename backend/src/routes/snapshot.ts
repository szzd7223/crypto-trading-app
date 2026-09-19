// ============================================================
// REST Routes — Order Book Snapshot
// GET /api/orderbook/snapshot
// ============================================================

import { Router } from 'express';
import type { OrderBook } from '../market/orderbook.js';

export function buildSnapshotRouter(orderBook: OrderBook): Router {
  const router = Router();

  router.get('/', (req, res) => {
    const snapshot = orderBook.snapshot();
    res.json(snapshot);
  });

  return router;
}
