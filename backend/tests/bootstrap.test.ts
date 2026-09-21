import { describe, it, expect, beforeEach } from "@jest/globals";
import { TradeGenerator } from "../src/market/generator.js";
import { CandleEngine } from "../src/market/candle-engine.js";
import { OrderBook } from "../src/market/orderbook.js";
import type { OHLCVCandle } from "../src/types.js";

describe("Market Data Bootstrap & Zero Discrepancy", () => {
  let generator: TradeGenerator;
  let candleEngine: CandleEngine;
  let orderBook: OrderBook;

  beforeEach(() => {
    generator = new TradeGenerator({ seed: 42 });
    candleEngine = new CandleEngine();
    orderBook = new OrderBook();
    generator.bootstrapHistory(candleEngine, orderBook, 1000);
  });

  it("populates at least 100 candles for 1m and 50 candles for 5m", () => {
    const candles1m = candleEngine.getHistory("1m");
    const candles5m = candleEngine.getHistory("5m");

    expect(candles1m.length).toBeGreaterThanOrEqual(100);
    expect(candles5m.length).toBeGreaterThanOrEqual(50);
  });

  it("guarantees zero discrepancy between 5m candle and its constituent 1m candles", () => {
    const candles1m = candleEngine.getHistory("1m", 500);
    const candles5m = candleEngine.getHistory("5m", 200);

    // Build a lookup map of 1m candles by openTime
    const map1m = new Map<number, OHLCVCandle>();
    for (const c of candles1m) {
      map1m.set(c.openTime, c);
    }

    // Find a fully closed 5m candle whose five 1m constituent candles are all present in 1m history
    let testedCount = 0;
    const FIVE_MIN_MS = 5 * 60_000;
    const ONE_MIN_MS = 60_000;

    for (const c5m of candles5m) {
      if (!c5m.isClosed) continue; // check fully closed buckets

      const m0 = map1m.get(c5m.openTime);
      const m1 = map1m.get(c5m.openTime + ONE_MIN_MS);
      const m2 = map1m.get(c5m.openTime + 2 * ONE_MIN_MS);
      const m3 = map1m.get(c5m.openTime + 3 * ONE_MIN_MS);
      const m4 = map1m.get(c5m.openTime + 4 * ONE_MIN_MS);

      if (m0 && m1 && m2 && m3 && m4) {
        // 1. Open of 5m must equal Open of first 1m candle
        expect(c5m.open).toBe(m0.open);

        // 2. Close of 5m must equal Close of fifth 1m candle
        expect(c5m.close).toBe(m4.close);

        // 3. High of 5m must equal max(High of all five 1m candles)
        const expectedHigh = Math.max(
          m0.high,
          m1.high,
          m2.high,
          m3.high,
          m4.high,
        );
        expect(c5m.high).toBe(expectedHigh);

        // 4. Low of 5m must equal min(Low of all five 1m candles)
        const expectedLow = Math.min(m0.low, m1.low, m2.low, m3.low, m4.low);
        expect(c5m.low).toBe(expectedLow);

        // 5. Volume of 5m must equal sum of volume of all five 1m candles (rounded to 4 decimals)
        const sumVol =
          Math.round(
            (m0.volume + m1.volume + m2.volume + m3.volume + m4.volume) *
              10_000,
          ) / 10_000;
        expect(c5m.volume).toBeCloseTo(sumVol, 4);

        testedCount++;
      }
    }

    expect(testedCount).toBeGreaterThan(10);
  });

  it("populates order book with 10 bids and 10 asks on startup", () => {
    const snap = orderBook.snapshot();

    expect(snap.sequenceId).toBeGreaterThan(0);
    expect(snap.bids.length).toBe(10);
    expect(snap.asks.length).toBe(10);

    // Bids sorted descending
    for (let i = 1; i < snap.bids.length; i++) {
      expect(snap.bids[i - 1]!.price).toBeGreaterThan(snap.bids[i]!.price);
    }
    // Asks sorted ascending
    for (let i = 1; i < snap.asks.length; i++) {
      expect(snap.asks[i - 1]!.price).toBeLessThan(snap.asks[i]!.price);
    }
    // Best ask > Best bid
    expect(snap.asks[0]!.price).toBeGreaterThan(snap.bids[0]!.price);
  });

  it("populates recent trades buffer with 50 trades, ordered newest first", () => {
    const recent = generator.getRecentTrades();

    expect(recent.length).toBe(50);
    for (let i = 1; i < recent.length; i++) {
      expect(recent[i - 1]!.id).toBeGreaterThan(recent[i]!.id);
      expect(recent[i - 1]!.timestamp).toBeGreaterThanOrEqual(
        recent[i]!.timestamp,
      );
      expect(recent[i]!.price).toBeGreaterThan(0);
      expect(recent[i]!.quantity).toBeGreaterThan(0);
    }
  });

  it("serves bootstrapped candles, orderbook snapshot, and trades via route handlers", async () => {
    const { buildCandlesRouter } = await import("../src/routes/candles.js");
    const { buildSnapshotRouter } = await import("../src/routes/snapshot.js");
    const { buildTradesRouter } = await import("../src/routes/trades.js");

    const candlesRouter = buildCandlesRouter(candleEngine);
    const snapshotRouter = buildSnapshotRouter(orderBook);
    const tradesRouter = buildTradesRouter(generator);

    const testRoute = (router: any, query: any = {}) => {
      return new Promise<any>((resolve) => {
        const req = { query, params: {}, url: "/", method: "GET" } as any;
        const res = {
          statusCode: 200,
          status(code: number) {
            this.statusCode = code;
            return this;
          },
          json(data: any) {
            resolve({ statusCode: this.statusCode, data });
          },
        } as any;
        router(req, res, () => {});
      });
    };

    const candlesRes = await testRoute(candlesRouter, {
      interval: "1m",
      limit: "20",
    });
    expect(candlesRes.statusCode).toBe(200);
    expect(candlesRes.data.candles.length).toBe(20);

    const snapshotRes = await testRoute(snapshotRouter);
    expect(snapshotRes.statusCode).toBe(200);
    expect(snapshotRes.data.bids.length).toBe(10);
    expect(snapshotRes.data.asks.length).toBe(10);

    const tradesRes = await testRoute(tradesRouter, { limit: "20" });
    expect(tradesRes.statusCode).toBe(200);
    expect(tradesRes.data.trades.length).toBe(20);
  });
});
