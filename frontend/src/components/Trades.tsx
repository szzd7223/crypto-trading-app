'use client';

import { useStore } from '@/store';

function fmtPrice(n: number) {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtQty(n: number) {
  return n.toFixed(4);
}

function fmtTime(ts: number) {
  return new Date(ts).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

export default function Trades() {
  const trades = useStore(s => s.recentTrades);

  return (
    <div className="flex flex-col h-full bg-[#121721] select-none">
      {/* Panel Title */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-[#1e2638] shrink-0">
        <h2 className="text-xs font-bold uppercase tracking-wider text-[#eaecef]">Recent Trades</h2>
        <span className="text-[10px] text-[#848e9c] font-mono font-medium">Live Stream</span>
      </div>

      {/* Column Headers */}
      <div className="grid grid-cols-3 px-4 py-1 text-[10px] font-semibold text-[#848e9c] border-b border-[#161c28] shrink-0">
        <span>Price (USDT)</span>
        <span className="text-right">Size (BTC)</span>
        <span className="text-right">Time</span>
      </div>

      {/* Trades Stream */}
      <div className="flex-1 overflow-y-auto divide-y divide-transparent">
        {trades.map(t => (
          <div
            key={t.id}
            className="grid grid-cols-3 px-4 py-0.5 font-mono text-xs tabular-nums hover:bg-[#181e2b] transition-colors cursor-default"
          >
            <span
              className={`font-bold ${
                t.side === 'buy' ? 'text-[#0ecb81]' : 'text-[#f6465d]'
              }`}
            >
              {fmtPrice(t.price)}
            </span>
            <span className="text-right font-medium text-[#eaecef]">{fmtQty(t.quantity)}</span>
            <span className="text-right text-[#848e9c] text-xs font-medium">{fmtTime(t.timestamp)}</span>
          </div>
        ))}

        {trades.length === 0 && (
          <div className="flex items-center justify-center h-24 text-sm text-[#848e9c]">
            Waiting for trades...
          </div>
        )}
      </div>
    </div>
  );
}
