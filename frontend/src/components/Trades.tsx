'use client';

import { useStore } from '@/store';

function fmt(n: number) {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtTime(ts: number) {
  return new Date(ts).toLocaleTimeString('en-US', {
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  });
}

export default function Trades() {
  const trades = useStore(s => s.recentTrades);

  return (
    <div className="flex flex-col h-full overflow-hidden bg-white">
      <div className="px-4 py-2.5 border-b border-gray-200 shrink-0">
        <h2 className="text-sm font-semibold text-gray-700">Recent Trades</h2>
      </div>
      <div className="flex justify-between px-4 py-1.5 text-xs text-gray-400 font-medium shrink-0">
        <span>Price</span>
        <span>Qty</span>
        <span>Time</span>
      </div>
      <div className="flex-1 overflow-y-auto">
        {trades.map(t => (
          <div key={t.id} className="flex justify-between px-4 py-[4px] font-mono text-[13px] hover:bg-gray-50">
            <span className={`font-medium ${t.side === 'buy' ? 'text-green-700' : 'text-red-600'}`}>
              {fmt(t.price)}
            </span>
            <span className="text-gray-600">{t.quantity.toFixed(4)}</span>
            <span className="text-gray-400 text-xs">{fmtTime(t.timestamp)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
