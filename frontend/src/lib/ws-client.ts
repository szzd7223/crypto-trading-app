// ============================================================
// WebSocket Client
//
// Handles:
//  - Connection + exponential backoff reconnect
//  - Ping/pong every 5s → latency report → tier feedback
//  - Tab visibility (pause pings when hidden)
//  - Message dispatch to store
//  - Stale state while disconnected
// ============================================================

import { useStore } from "@/store";
import { LatencyTracker } from "./latency-tracker";
import { OrderBookSyncManager } from "./orderbook-sync";
import { getBackendUrl, getWsUrl } from "./config";
import type { WsServerMessage, WsClientMessage, Interval } from "@/types";
const PING_INTERVAL_MS = 5_000;
const MAX_BACKOFF_MS = 30_000;

class WebSocketClient {
  private ws: WebSocket | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private backoffMs = 1_000;
  private destroyed = false;
  private simulateDropUntil = 0;
  private currentInterval: Interval = "1m";

  private latency = new LatencyTracker();
  private obSync = new OrderBookSyncManager((bids, asks, seqId) => {
    useStore.getState().setOrderBook(bids, asks, seqId);
  });

  connect(): void {
    this.destroyed = false; // reset so StrictMode's double-mount works

    // Close any existing socket cleanly before opening a new one.
    // Prevents a brief overlap where two sockets both fire messages.
    if (this.ws) {
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.onclose = null;
      this.ws.onerror = null;
      this.ws.close();
      this.ws = null;
    }
    this.stopPings();

    const store = useStore.getState();
    store.setStatus("connecting");
    store.setStale(false);

    // Warm-up ping to wake up free-tier cloud containers (e.g. Render spin-down)
    if (typeof window !== "undefined" && typeof window.fetch === "function") {
      fetch(`${getBackendUrl()}/health`).catch(() => {});
    }

    try {
      this.ws = new WebSocket(getWsUrl());
    } catch {
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this.backoffMs = 1_000;
      useStore.getState().setStatus("connected");
      // Re-subscribe to current interval
      this.send({ type: "subscribe", interval: this.currentInterval });
      // Fetch initial candle history and recent trades
      void this.fetchCandles(this.currentInterval);
      void this.fetchTrades();
      // Start order book sync
      this.obSync.reset();
      void this.obSync.startSync();
      // Start pings
      this.startPings();
    };

    this.ws.onmessage = (ev) => {
      this.handleMessage(ev.data as string);
    };

    this.ws.onclose = () => {
      this.stopPings();
      if (!this.destroyed) {
        useStore.getState().setStatus("disconnected");
        useStore.getState().setStale(true);
        this.scheduleReconnect();
      }
    };

    this.ws.onerror = () => {
      // onclose will fire after onerror
    };
  }

  subscribe(interval: Interval): void {
    this.currentInterval = interval;
    useStore.getState().setActiveInterval(interval);
    this.send({ type: "subscribe", interval });
    void this.fetchCandles(interval);
  }

  sendOverride(tier: import("@/types").DeliveryTier | null): void {
    this.send({ type: "force_tier", tier });
  }

  /** Temporarily drops connection for durationMs to demonstrate STALE state & auto-recovery */
  simulateDisconnect(durationMs: number = 5000): void {
    if (this.destroyed) return;
    this.simulateDropUntil = Date.now() + durationMs;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.close();
  }

  destroy(): void {
    this.destroyed = true;
    this.stopPings();
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
  }

  // ---- Private ----

  private handleMessage(raw: string): void {
    let msg: WsServerMessage;
    try {
      msg = JSON.parse(raw) as WsServerMessage;
    } catch {
      return;
    }

    const store = useStore.getState();

    switch (msg.type) {
      case "trade":
        store.setTrade(msg.data);
        break;

      case "candle_update":
        store.updateActiveCandle(msg.interval, msg.data);
        break;

      case "orderbook_delta":
        this.obSync.receiveDelta(msg.data);
        break;

      case "pong": {
        const result = this.latency.recordPong(msg.id, msg.clientTs);
        if (result) {
          store.setLatency(result.rtt, result.jitter);
          // Report to server
          this.send({
            type: "latency_report",
            rtt: result.rtt,
            jitter: result.jitter,
          });
        }
        break;
      }

      case "tier_update":
        store.setTier(msg.tier, msg.effectiveRateMs);
        break;

      case "connection_ready":
        store.setTier(msg.tier, msg.effectiveRateMs);
        break;

      case "recent_trades":
        store.setRecentTrades(msg.data);
        break;
    }
  }

  private startPings(): void {
    this.stopPings();
    this.pingTimer = setInterval(() => {
      if (document.visibilityState === "hidden") return;
      const id = crypto.randomUUID();
      this.latency.recordPing(id);
      this.send({ type: "ping", id, clientTs: Date.now() });
    }, PING_INTERVAL_MS);
  }

  private stopPings(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  private scheduleReconnect(): void {
    if (this.destroyed) return;
    if (this.reconnectTimer) return;

    const now = Date.now();
    const delay =
      this.simulateDropUntil > now
        ? Math.max(this.simulateDropUntil - now, this.backoffMs)
        : this.backoffMs;

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
    this.backoffMs = Math.min(this.backoffMs * 2, MAX_BACKOFF_MS);
  }

  private send(msg: WsClientMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  private async fetchCandles(interval: Interval): Promise<void> {
    const backend = getBackendUrl();
    try {
      const res = await fetch(
        `${backend}/api/candles?interval=${interval}&limit=200`,
      );
      if (!res.ok) return;
      const data = (await res.json()) as {
        interval: Interval;
        candles: import("@/types").OHLCVCandle[];
      };

      // Guard: interval may have changed while request was in flight
      if (data.interval !== this.currentInterval) return;
      if (data.candles.length === 0) return;

      useStore.getState().setCandles(interval, data.candles);
    } catch {
      // silently ignore — chart will populate from live updates
    }
  }

  private async fetchTrades(): Promise<void> {
    const backend = getBackendUrl();
    try {
      const res = await fetch(`${backend}/api/trades?limit=50`);
      if (!res.ok) return;
      const data = (await res.json()) as { trades: import("@/types").Trade[] };
      if (!data.trades || data.trades.length === 0) return;

      useStore.getState().setRecentTrades(data.trades);
    } catch {
      // silently ignore
    }
  }
}

// Singleton — one connection for the lifetime of the app
export const wsClient = new WebSocketClient();
