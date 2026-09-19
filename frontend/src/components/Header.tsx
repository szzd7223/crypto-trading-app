'use client';

import { useStore } from '@/store';

export default function Header() {
  const price       = useStore(s => s.price);
  const priceChange = useStore(s => s.priceChange);
  const status      = useStore(s => s.status);
  const isStale     = useStore(s => s.isStale);

  const isUp   = priceChange > 0;
  const isDown = priceChange < 0;

  const effectiveState = isStale ? 'stale' : status;
  const statusLabel    = isStale ? 'STALE' : status.toUpperCase();

  const dotClass =
    effectiveState === 'connected'    ? 'bg-up animate-none' :
    effectiveState === 'connecting'   ? 'bg-warn animate-pulse-dot' :
    effectiveState === 'stale'        ? 'bg-warn' :
    /* disconnected */                  'bg-down';

  const statusClass =
    effectiveState === 'connected'    ? 'text-up' :
    effectiveState === 'disconnected' ? 'text-down' :
    /* stale / connecting */            'text-warn';

  return (
    <header className="flex items-center gap-6 px-6 h-14 border-b border-gray-200 bg-white shrink-0">
      {/* Symbol */}
      <div className="text-base font-bold tracking-wide text-gray-900">
        BTC<span className="text-gray-400 font-normal">/USDT</span>
      </div>

      {/* Price */}
      <div className={`font-mono text-2xl font-bold flex items-baseline gap-2 ${isUp ? 'text-up' : isDown ? 'text-down' : 'text-gray-900'}`}>
        {price !== null
          ? price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
          : '—'}
        {priceChange !== 0 && (
          <span className="text-sm font-normal opacity-70">
            {isUp ? '+' : ''}{priceChange.toFixed(2)}
          </span>
        )}
      </div>

      {/* Status */}
      <div className={`ml-auto flex items-center gap-2 text-xs font-semibold tracking-widest ${statusClass}`}>
        <span className={`w-2 h-2 rounded-full ${dotClass}`} />
        {statusLabel}
      </div>
    </header>
  );
}
