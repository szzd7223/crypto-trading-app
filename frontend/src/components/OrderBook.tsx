"use client";

import { useMemo } from "react";
import { useStore } from "@/store";

function fmtPrice(n: number) {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function fmtQty(n: number) {
  return n.toFixed(4);
}

export default function OrderBook() {
  const bids = useStore((s) => s.bids);
  const asks = useStore((s) => s.asks);
  const price = useStore((s) => s.price);
  const isStale = useStore((s) => s.isStale);

  // Compute cumulative depths and max for the visual depth bar
  const { asksWithTotal, bidsWithTotal, maxTotal } = useMemo(() => {
    let runningAsk = 0;
    const asksWithTotal = [];
    for (const a of asks.slice(0, 10)) {
      runningAsk += a.quantity;
      asksWithTotal.push({ ...a, total: runningAsk });
    }

    let runningBid = 0;
    const bidsWithTotal = [];
    for (const b of bids.slice(0, 10)) {
      runningBid += b.quantity;
      bidsWithTotal.push({ ...b, total: runningBid });
    }

    const maxTotal = Math.max(runningAsk, runningBid, 1);
    return { asksWithTotal, bidsWithTotal, maxTotal };
  }, [bids, asks]);

  const bestBid = bids[0]?.price;
  const bestAsk = asks[0]?.price;
  const spread = bestBid && bestAsk ? bestAsk - bestBid : null;
  const spreadPct = spread && bestAsk ? (spread / bestAsk) * 100 : null;

  return (
    <div className="flex flex-col h-full bg-[#121721] select-none">
      {/* Panel Title */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-[#1e2638] shrink-0">
        <h2 className="text-xs font-bold uppercase tracking-wider text-[#eaecef]">
          Order Book
        </h2>
        <div className="flex items-center gap-2">
          {isStale && (
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#f59e0b] border border-[#f59e0b]/40 rounded px-1.5 py-0.5 bg-[#f59e0b]/10">
              STALE
            </span>
          )}
          <span className="text-[10px] text-[#848e9c] font-mono font-medium">
            10 Levels
          </span>
        </div>
      </div>

      {/* Column Headers */}
      <div className="grid grid-cols-3 px-4 py-1 text-[10px] font-semibold text-[#848e9c] border-b border-[#161c28] shrink-0">
        <span>Price (USDT)</span>
        <span className="text-right">Size (BTC)</span>
        <span className="text-right">Total</span>
      </div>

      {/* Asks Label */}
      <div className="flex items-center justify-between px-4 py-0.5 bg-[#f6465d]/5 border-b border-[#1e2638]/40 shrink-0 text-[10px] font-bold uppercase tracking-wider text-[#f6465d]">
        <span className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-[#f6465d]" />
          Asks (Sells)
        </span>
      </div>

      {/* Asks (Sell Orders) — rendered low→high, flex-col-reverse places lowest ask at the bottom next to spread */}
      <div className="flex-1 min-h-0 flex flex-col-reverse overflow-y-auto">
        {asksWithTotal.map((a) => {
          const depthPct = Math.min((a.total / maxTotal) * 100, 100);
          return (
            <div
              key={a.price}
              className="relative grid grid-cols-3 px-4 py-0.5 font-mono text-xs tabular-nums hover:bg-[#181e2b] transition-colors cursor-default shrink-0"
            >
              <div
                className="absolute inset-y-0 right-0 bg-[#f6465d]/15 pointer-events-none transition-[width] duration-100"
                style={{ width: `${depthPct}%` }}
              />
              <span className="relative font-bold text-[#f6465d]">
                {fmtPrice(a.price)}
              </span>
              <span className="relative text-right font-medium text-[#eaecef]">
                {fmtQty(a.quantity)}
              </span>
              <span className="relative text-right font-medium text-[#848e9c]">
                {fmtQty(a.total)}
              </span>
            </div>
          );
        })}
      </div>

      {/* Mid-Market Spread & Live Price Bar */}
      <div className="flex items-center justify-between px-4 py-2 border-y border-[#1e2638] bg-[#0e131d] shrink-0">
        <div className="flex items-baseline gap-2 font-mono">
          <span className="text-sm font-bold text-white tabular-nums">
            {price !== null ? fmtPrice(price) : "—"}
          </span>
          <span className="text-[10px] font-semibold text-[#848e9c]">USDT</span>
        </div>

        {spread !== null && (
          <div className="flex items-center gap-1.5 text-[10px] font-mono text-[#94a3b8]">
            <span className="text-[#848e9c] font-medium">Spread:</span>
            <span className="text-[#eaecef] font-bold">
              {spread.toFixed(2)}
            </span>
            {spreadPct !== null && (
              <span className="text-[#848e9c] font-medium">
                ({spreadPct.toFixed(2)}%)
              </span>
            )}
          </div>
        )}
      </div>

      {/* Bids Label */}
      <div className="flex items-center justify-between px-4 py-0.5 bg-[#0ecb81]/5 border-b border-[#1e2638]/40 shrink-0 text-[10px] font-bold uppercase tracking-wider text-[#0ecb81]">
        <span className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-[#0ecb81]" />
          Bids (Buys)
        </span>
      </div>

      {/* Bids (Buy Orders - Up) - highest bid at the top */}
      <div className="flex-1 min-h-0 flex flex-col justify-start overflow-y-auto">
        {bidsWithTotal.map((b) => {
          const depthPct = Math.min((b.total / maxTotal) * 100, 100);
          return (
            <div
              key={b.price}
              className="relative grid grid-cols-3 px-4 py-0.5 font-mono text-xs tabular-nums hover:bg-[#181e2b] transition-colors cursor-default shrink-0"
            >
              <div
                className="absolute inset-y-0 right-0 bg-[#0ecb81]/15 pointer-events-none transition-[width] duration-100"
                style={{ width: `${depthPct}%` }}
              />
              <span className="relative font-bold text-[#0ecb81]">
                {fmtPrice(b.price)}
              </span>
              <span className="relative text-right font-medium text-[#eaecef]">
                {fmtQty(b.quantity)}
              </span>
              <span className="relative text-right font-medium text-[#848e9c]">
                {fmtQty(b.total)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
