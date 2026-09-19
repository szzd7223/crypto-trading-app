'use client';

import { useStore } from '@/store';

function fmt(n: number) {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function OrderBook() {
  const bids = useStore(s => s.bids);
  const asks = useStore(s => s.asks);

  const maxBid = bids.reduce((m, b) => Math.max(m, b.quantity), 0) || 1;
  const maxAsk = asks.reduce((m, a) => Math.max(m, a.quantity), 0) || 1;

  return (
    <div className="flex flex-col h-full overflow-hidden bg-white">
      {/* Section title */}
      <div className="px-4 py-2.5 border-b border-gray-200 shrink-0">
        <h2 className="text-sm font-semibold text-gray-700">Order Book</h2>
      </div>

      {/* Column labels */}
      <div className="flex justify-between px-4 py-1.5 text-xs text-gray-400 font-medium shrink-0">
        <span>Price (USDT)</span>
        <span>Qty (BTC)</span>
      </div>

      {/* Asks (sell offers) — reversed so lowest ask is nearest the spread */}
      <div className="flex-1 flex flex-col-reverse overflow-hidden">
        {asks.map(a => (
          <div key={a.price} className="relative flex justify-between px-4 py-[3px] font-mono text-[13px] hover:bg-gray-50">
            <div
              className="absolute inset-y-0 right-0 bg-red-100 transition-[width] duration-150"
              style={{ width: `${(a.quantity / maxAsk) * 100}%` }}
            />
            <span className="relative font-medium text-red-600">{fmt(a.price)}</span>
            <span className="relative text-gray-600">{a.quantity.toFixed(4)}</span>
          </div>
        ))}
      </div>

      {/* Spread */}
      {bids[0] && asks[0] && (
        <div className="text-center text-xs text-gray-500 py-1.5 border-y border-gray-100 bg-gray-50 shrink-0">
          Spread: <span className="font-mono font-medium">{(asks[0].price - bids[0].price).toFixed(2)}</span>
        </div>
      )}

      {/* Bids (buy offers) */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {bids.map(b => (
          <div key={b.price} className="relative flex justify-between px-4 py-[3px] font-mono text-[13px] hover:bg-gray-50">
            <div
              className="absolute inset-y-0 right-0 bg-green-100 transition-[width] duration-150"
              style={{ width: `${(b.quantity / maxBid) * 100}%` }}
            />
            <span className="relative font-medium text-green-700">{fmt(b.price)}</span>
            <span className="relative text-gray-600">{b.quantity.toFixed(4)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
