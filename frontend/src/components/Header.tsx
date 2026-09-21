"use client";

import { useMemo } from "react";
import { useStore } from "@/store";

export default function Header() {
  const price = useStore((s) => s.price);
  const priceChange = useStore((s) => s.priceChange);
  const status = useStore((s) => s.status);
  const isStale = useStore((s) => s.isStale);
  const tier = useStore((s) => s.tier);
  const rtt = useStore((s) => s.rtt);
  const candles1m = useStore((s) => s.candles1m);
  const candles5m = useStore((s) => s.candles5m);

  const candles = candles1m.length > 0 ? candles1m : candles5m;

  const stats = useMemo(() => {
    if (candles.length === 0) return null;
    let high = -Infinity;
    let low = Infinity;
    let vol = 0;
    for (const c of candles) {
      if (c.high > high) high = c.high;
      if (c.low < low) low = c.low;
      vol += c.volume;
    }
    const openPrice = candles[0]?.open ?? price ?? 0;
    const currentPrice = price ?? candles[candles.length - 1]?.close ?? 0;
    const change24h = currentPrice - openPrice;
    const changePct = openPrice > 0 ? (change24h / openPrice) * 100 : 0;
    return {
      high: high === -Infinity ? null : high,
      low: low === Infinity ? null : low,
      vol,
      change24h,
      changePct,
    };
  }, [candles, price]);

  const isUp = priceChange > 0;
  const isDown = priceChange < 0;

  const effectiveState = isStale ? "stale" : status;
  const statusLabel = isStale ? "STALE" : status.toUpperCase();

  const dotColor =
    effectiveState === "connected"
      ? "bg-[#0ecb81]"
      : effectiveState === "connecting"
        ? "bg-[#f59e0b] animate-pulse-dot"
        : effectiveState === "stale"
          ? "bg-[#f59e0b]"
          : /* disconnected */ "bg-[#f6465d]";

  const tierBadgeColor =
    tier === "full"
      ? "bg-[#0ecb81]/15 text-[#0ecb81] border-[#0ecb81]/30"
      : tier === "degraded"
        ? "bg-[#f59e0b]/15 text-[#f59e0b] border-[#f59e0b]/30"
        : "bg-[#f6465d]/15 text-[#f6465d] border-[#f6465d]/30";

  return (
    <header className="flex flex-col sm:flex-row sm:items-center justify-between px-3.5 py-2.5 sm:px-5 sm:h-16 rounded-xl bg-[#121721] border border-[#1e2638] shadow-md select-none shrink-0 z-20 gap-2.5 sm:gap-4 overflow-hidden">
      {/* Top row on mobile / Left group on tablet & desktop */}
      <div className="flex items-center justify-between sm:justify-start gap-3 sm:gap-4 lg:gap-6 min-w-0 shrink-0">
        {/* Symbol badge */}
        <div className="flex items-center gap-2.5 sm:gap-3 shrink-0">
          <div className="w-8 h-8 rounded-full bg-[#f7931a]/15 border border-[#f7931a]/30 flex items-center justify-center font-bold text-xs sm:text-sm text-[#f7931a] shrink-0">
            ₿
          </div>
          <div className="shrink-0">
            <div className="flex items-center gap-1.5 sm:gap-2">
              <span className="text-sm sm:text-base font-bold tracking-wide text-white">
                BTC/USDT
              </span>
              <span className="text-[10px] sm:text-xs uppercase font-semibold px-1.5 sm:px-2 py-0.5 rounded bg-[#1e2638] text-[#94a3b8]">
                Spot
              </span>
            </div>
            <div className="text-[11px] text-[#848e9c] font-medium hidden md:block leading-none mt-0.5">
              Bitcoin
            </div>
          </div>
        </div>

        {/* Mobile-only status & tier indicators on row 1 (hidden on sm+) */}
        <div className="flex sm:hidden items-center gap-2 shrink-0">
          <div
            className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase tracking-wider border ${tierBadgeColor}`}
          >
            {tier}
          </div>

          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[#181e2b] border border-[#1e2638]">
            <span className={`w-2 h-2 rounded-full ${dotColor}`} />
            <span className="text-[10px] font-bold tracking-wider text-[#848e9c]">
              {statusLabel}
            </span>
          </div>
        </div>

        {/* Divider on tablet/desktop */}
        <div className="h-7 w-px bg-[#1e2638] hidden sm:block shrink-0" />

        {/* Live Price & Change badge (visible on sm+ next to symbol; on mobile in row 2) */}
        <div className="hidden sm:flex items-center gap-2.5 lg:gap-3.5 shrink-0">
          <span
            className={`font-mono tabular-nums text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight transition-colors duration-150 shrink-0 ${
              isUp ? "text-[#0ecb81]" : isDown ? "text-[#f6465d]" : "text-white"
            }`}
          >
            {price !== null
              ? price.toLocaleString("en-US", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })
              : "—"}
          </span>

          {stats && (
            <div
              className={`flex items-center gap-1 font-mono text-xs font-bold px-2 py-1 rounded-md border shrink-0 ${
                stats.change24h >= 0
                  ? "bg-[#0ecb81]/15 border-[#0ecb81]/30 text-[#0ecb81]"
                  : "bg-[#f6465d]/15 border-[#f6465d]/30 text-[#f6465d]"
              }`}
            >
              <span>{stats.change24h >= 0 ? "▲" : "▼"}</span>
              <span className="hidden xl:inline">
                {stats.change24h >= 0 ? "+" : ""}
                {stats.change24h.toFixed(2)}
              </span>
              <span>
                {stats.changePct >= 0 ? "+" : ""}
                {stats.changePct.toFixed(2)}%
              </span>
            </div>
          )}
        </div>

        {/* Large screen (xl+) Session Stats summary */}
        <div className="h-7 w-px bg-[#1e2638] hidden xl:block shrink-0" />

        <div className="hidden xl:flex items-center gap-5 lg:gap-6 shrink-0">
          <div className="flex flex-col">
            <span className="text-[10px] text-[#848e9c] uppercase font-semibold tracking-wider">
              Session High
            </span>
            <span className="font-mono tabular-nums text-xs text-[#f1f5f9] font-semibold">
              {stats?.high
                ? stats.high.toLocaleString("en-US", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })
                : "—"}
            </span>
          </div>

          <div className="flex flex-col">
            <span className="text-[10px] text-[#848e9c] uppercase font-semibold tracking-wider">
              Session Low
            </span>
            <span className="font-mono tabular-nums text-xs text-[#f1f5f9] font-semibold">
              {stats?.low
                ? stats.low.toLocaleString("en-US", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })
                : "—"}
            </span>
          </div>

          <div className="flex flex-col">
            <span className="text-[10px] text-[#848e9c] uppercase font-semibold tracking-wider">
              Session Vol (BTC)
            </span>
            <span className="font-mono tabular-nums text-xs text-[#f1f5f9] font-semibold">
              {stats?.vol ? stats.vol.toFixed(2) : "—"}
            </span>
          </div>
        </div>
      </div>

      {/* Mobile-only Row 2: Live Price, 24h Change & Compact High/Low Stats (hidden on sm+) */}
      <div className="flex sm:hidden items-center justify-between gap-2 pt-0.5">
        <div className="flex items-center gap-2 shrink-0">
          <span
            className={`font-mono tabular-nums text-xl font-bold tracking-tight transition-colors duration-150 ${
              isUp ? "text-[#0ecb81]" : isDown ? "text-[#f6465d]" : "text-white"
            }`}
          >
            {price !== null
              ? price.toLocaleString("en-US", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })
              : "—"}
          </span>

          {stats && (
            <div
              className={`flex items-center gap-1 font-mono text-[11px] font-bold px-1.5 py-0.5 rounded border ${
                stats.change24h >= 0
                  ? "bg-[#0ecb81]/15 border-[#0ecb81]/30 text-[#0ecb81]"
                  : "bg-[#f6465d]/15 border-[#f6465d]/30 text-[#f6465d]"
              }`}
            >
              <span>{stats.change24h >= 0 ? "▲" : "▼"}</span>
              <span>
                {stats.changePct >= 0 ? "+" : ""}
                {stats.changePct.toFixed(2)}%
              </span>
            </div>
          )}
        </div>

        {/* Compact High/Low stats pill on mobile */}
        {stats && (
          <div className="flex items-center gap-2 text-[10px] font-mono text-[#848e9c] shrink-0">
            <div className="flex items-center gap-1">
              <span>H:</span>
              <span className="text-[#eaecef] font-medium">
                {stats.high
                  ? stats.high.toLocaleString("en-US", { maximumFractionDigits: 1 })
                  : "—"}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <span>L:</span>
              <span className="text-[#eaecef] font-medium">
                {stats.low
                  ? stats.low.toLocaleString("en-US", { maximumFractionDigits: 1 })
                  : "—"}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Tablet & Desktop Right section: Latency, Tier, Status (hidden on mobile) */}
      <div className="hidden sm:flex items-center gap-2.5 lg:gap-3 shrink-0">
        {/* Tier badge */}
        <div
          className={`px-2.5 py-1 rounded-md text-xs font-mono font-bold uppercase tracking-wider border shrink-0 ${tierBadgeColor}`}
        >
          Tier: {tier}
        </div>

        {/* Latency badge */}
        {rtt !== null && rtt >= 0 && (
          <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#181e2b] border border-[#1e2638] text-xs font-mono text-[#848e9c] shrink-0">
            <span className="text-[#848e9c] font-medium">RTT</span>
            <span className="text-[#eaecef] font-semibold">{rtt}ms</span>
          </div>
        )}

        {/* Connection status indicator */}
        <div className="flex items-center gap-2 px-2.5 sm:px-3 py-1 rounded-full bg-[#181e2b] border border-[#1e2638] shrink-0">
          <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${dotColor}`} />
          <span className="text-xs font-bold tracking-wider text-[#848e9c]">
            {statusLabel}
          </span>
        </div>
      </div>
    </header>
  );
}
