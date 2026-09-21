// ============================================================
// Seeded Pseudo-Random Number Generator (LCG)
// Using a seeded generator makes the market feed deterministic
// and reproducible — same seed = same price sequence every run.
// ============================================================

export class SeededRandom {
  private seed: number;

  constructor(seed: number = 42) {
    this.seed = seed;
  }

  /** Returns a float in [0, 1) */
  next(): number {
    // LCG parameters from Numerical Recipes
    this.seed = (this.seed * 1664525 + 1013904223) & 0xffffffff;
    // Shift to positive 32-bit unsigned then normalise
    return (this.seed >>> 0) / 0x100000000;
  }

  /** Returns a float in [min, max) */
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /** Box-Muller transform → standard normal sample */
  gaussian(mean: number = 0, stddev: number = 1): number {
    const u1 = Math.max(this.next(), 1e-10);
    const u2 = this.next();
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return mean + stddev * z;
  }
}

// ============================================================
// Trade Generator — Geometric Brownian Motion
//
// Plain English:
//  - We start at a base price (e.g. $43,000)
//  - Every tick, price changes by a tiny random % (up or down)
//  - "Drift" = slight upward bias per tick
//  - "Volatility" = how big the random swings are
//  - "Mean reversion" = a gentle pull back toward the start price
//    so it never drifts to $0 or infinity
// ============================================================

import type { Trade } from "../types.js";
import type { CandleEngine } from "./candle-engine.js";
import type { OrderBook } from "./orderbook.js";

interface GeneratorConfig {
  seed?: number;
  startPrice?: number;
  /** Per-tick drift (fraction). ~0 for flat market */
  drift?: number;
  /** Per-tick volatility (fraction). Higher = wilder swings */
  volatility?: number;
  /** Strength of mean reversion pull (0 = off, 1 = instant snap) */
  meanReversionStrength?: number;
  /** Min ms between ticks */
  minIntervalMs?: number;
  /** Max ms between ticks */
  maxIntervalMs?: number;
}

export class TradeGenerator {
  private rng: SeededRandom;
  private currentPrice: number;
  private readonly startPrice: number;
  private readonly drift: number;
  private readonly volatility: number;
  private readonly meanReversionStrength: number;
  private readonly minIntervalMs: number;
  private readonly maxIntervalMs: number;
  private tradeId: number = 0;
  private momentum: number = 0;
  private listeners: Array<(trade: Trade) => void> = [];
  private recentTrades: Trade[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running: boolean = false;

  constructor(config: GeneratorConfig = {}) {
    this.rng = new SeededRandom(config.seed ?? 42);
    this.startPrice = config.startPrice ?? 43_000;
    this.currentPrice = this.startPrice;
    this.drift = config.drift ?? 0.00002;
    this.volatility = config.volatility ?? 0.00004; // Realistic ~$15-$80 1m candle movements
    this.meanReversionStrength = config.meanReversionStrength ?? 0.00005; // Gentle long-term stabilization
    this.minIntervalMs = config.minIntervalMs ?? 200;
    this.maxIntervalMs = config.maxIntervalMs ?? 600;
  }

  /**
   * Pre-seeds historical market data up to Date.now().
   * Aligns to standard 5-minute boundaries so 1m and 5m candles have zero discrepancy.
   */
  bootstrapHistory(
    candleEngine: CandleEngine,
    orderBook?: OrderBook,
    minutesBack: number = 1000,
  ): void {
    const now = Date.now();
    const FIVE_MIN_MS = 5 * 60_000;
    const current5mStart = Math.floor(now / FIVE_MIN_MS) * FIVE_MIN_MS;
    const startTime = current5mStart - minutesBack * 60_000;

    const historicalTrades: Trade[] = [];
    let t = startTime;
    let lastTrade: Trade | null = null;

    // Simulate market ticks at the exact same frequency as live trading (200-600ms)
    while (t < now) {
      const delay = Math.round(
        this.rng.range(this.minIntervalMs, this.maxIntervalMs),
      );
      t += delay;
      if (t >= now) break;

      const noise = this.rng.gaussian(0, this.volatility);
      this.momentum = this.momentum * 0.85 + noise;
      const reversionPull =
        this.meanReversionStrength *
        Math.log(this.startPrice / this.currentPrice);
      const newPrice =
        this.currentPrice * Math.exp(this.momentum + reversionPull);

      const prevPrice = this.currentPrice;
      this.currentPrice = Math.max(
        this.startPrice * 0.4,
        Math.min(this.startPrice * 1.6, newPrice),
      );

      const quantity = Math.round(this.rng.range(0.01, 5) * 10_000) / 10_000;
      const side: Trade["side"] =
        this.currentPrice >= prevPrice ? "buy" : "sell";

      const trade: Trade = {
        id: ++this.tradeId,
        timestamp: t,
        price: Math.round(this.currentPrice * 100) / 100,
        quantity,
        side,
      };

      candleEngine.processTrade(trade);
      lastTrade = trade;

      historicalTrades.push(trade);
      if (historicalTrades.length > 50) {
        historicalTrades.shift();
      }
    }

    // Keep the most recent 50 trades, newest first
    this.recentTrades = historicalTrades.reverse();

    // Seed order book with the latest trade price and sequence
    if (orderBook && lastTrade) {
      orderBook.update(lastTrade);
    }
  }

  /** Returns recent trades (up to 50, newest first) */
  getRecentTrades(): Trade[] {
    return [...this.recentTrades];
  }

  /** Subscribe to every generated trade */
  onTrade(listener: (trade: Trade) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  /** Start emitting trades at random intervals */
  start(): void {
    if (this.running) return;
    this.running = true;
    this.scheduleTick();
  }

  /** Stop emitting trades */
  stop(): void {
    this.running = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  get price(): number {
    return this.currentPrice;
  }

  // ---- Private ----

  private scheduleTick(): void {
    if (!this.running) return;
    const delay = Math.round(
      this.rng.range(this.minIntervalMs, this.maxIntervalMs),
    );
    this.timer = setTimeout(() => {
      this.tick();
      this.scheduleTick();
    }, delay);
  }

  private tick(): void {
    const noise = this.rng.gaussian(0, this.volatility);
    this.momentum = this.momentum * 0.85 + noise;

    // Mean-reversion pull toward startPrice
    const reversionPull =
      this.meanReversionStrength *
      Math.log(this.startPrice / this.currentPrice);

    const newPrice =
      this.currentPrice * Math.exp(this.momentum + reversionPull);

    const prevPrice = this.currentPrice;
    this.currentPrice = Math.max(
      this.startPrice * 0.4,
      Math.min(this.startPrice * 1.6, newPrice),
    );

    // Quantity: random 0.01–5 BTC, rounded to 4 decimal places
    const quantity = Math.round(this.rng.range(0.01, 5) * 10_000) / 10_000;
    const side: Trade["side"] = this.currentPrice >= prevPrice ? "buy" : "sell";

    const trade: Trade = {
      id: ++this.tradeId,
      timestamp: Date.now(),
      price: Math.round(this.currentPrice * 100) / 100, // 2 decimal places
      quantity,
      side,
    };

    this.recentTrades.unshift(trade);
    if (this.recentTrades.length > 50) {
      this.recentTrades.pop();
    }

    this.emit(trade);
  }

  private emit(trade: Trade): void {
    for (const listener of this.listeners) {
      listener(trade);
    }
  }
}
