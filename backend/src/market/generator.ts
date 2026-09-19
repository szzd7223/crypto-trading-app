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
    return ((this.seed >>> 0) / 0x100000000);
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

import type { Trade } from '../types.js';

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
  private listeners: Array<(trade: Trade) => void> = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running: boolean = false;

  constructor(config: GeneratorConfig = {}) {
    this.rng = new SeededRandom(config.seed ?? 42);
    this.startPrice = config.startPrice ?? 43_000;
    this.currentPrice = this.startPrice;
    this.drift = config.drift ?? 0.00002;           // tiny positive drift
    this.volatility = config.volatility ?? 0.0008;  // ~0.08% per tick
    this.meanReversionStrength = config.meanReversionStrength ?? 0.01;
    this.minIntervalMs = config.minIntervalMs ?? 200;
    this.maxIntervalMs = config.maxIntervalMs ?? 600;
  }

  /** Subscribe to every generated trade */
  onTrade(listener: (trade: Trade) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
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
    const delay = Math.round(this.rng.range(this.minIntervalMs, this.maxIntervalMs));
    this.timer = setTimeout(() => {
      this.tick();
      this.scheduleTick();
    }, delay);
  }

  private tick(): void {
    // Geometric Brownian Motion step:
    //   dS = S * (drift * dt + volatility * random_normal)
    // dt is normalised so drift/volatility are per-tick values already.
    const noise = this.rng.gaussian(0, 1);
    const gbmReturn = this.drift + this.volatility * noise;

    // Mean-reversion pull toward startPrice
    const reversionPull = this.meanReversionStrength *
      Math.log(this.startPrice / this.currentPrice);

    const newPrice = this.currentPrice * Math.exp(gbmReturn + reversionPull);

    // Clamp to a reasonable band: ±60% of start price
    this.currentPrice = Math.max(
      this.startPrice * 0.4,
      Math.min(this.startPrice * 1.6, newPrice)
    );

    // Quantity: random 0.01–5 BTC, rounded to 4 decimal places
    const quantity = Math.round(this.rng.range(0.01, 5) * 10_000) / 10_000;
    const side: Trade['side'] = this.rng.next() > 0.5 ? 'buy' : 'sell';

    const trade: Trade = {
      id: ++this.tradeId,
      timestamp: Date.now(),
      price: Math.round(this.currentPrice * 100) / 100, // 2 decimal places
      quantity,
      side,
    };

    this.emit(trade);
  }

  private emit(trade: Trade): void {
    for (const listener of this.listeners) {
      listener(trade);
    }
  }
}
