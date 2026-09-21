'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { wsClient } from '@/lib/ws-client';
import Header from '@/components/Header';
import OrderBook from '@/components/OrderBook';
import Trades from '@/components/Trades';
import DebugPanel from '@/components/DebugPanel';

const Chart = dynamic(() => import('@/components/Chart'), { ssr: false });

type MobileTab = 'chart' | 'orderbook' | 'trades' | 'split';

export default function TradingPage() {
  useEffect(() => {
    wsClient.connect();
    return () => wsClient.destroy();
  }, []);

  // Mobile tab state
  const [mobileTab, setMobileTab] = useState<MobileTab>('chart');
  // Sub-tab for mobile split mode
  const [splitSubTab, setSplitSubTab] = useState<'book' | 'trades'>('book');

  // splitPct = % of sidebar height given to the Order Book panel (0–100) on desktop
  const [splitPct, setSplitPct] = useState(65);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
  }, []);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!dragging.current || !sidebarRef.current) return;
      const rect = sidebarRef.current.getBoundingClientRect();
      const relY = e.clientY - rect.top;
      const pct = Math.min(85, Math.max(15, (relY / rect.height) * 100));
      setSplitPct(Math.round(pct));
    };

    const onMouseUp = () => {
      if (!dragging.current) return;
      dragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, []);

  return (
    <div className="flex flex-col h-[100dvh] overflow-hidden bg-[#07090e] p-2 sm:p-4 lg:px-7 lg:py-4 gap-2 sm:gap-3.5 lg:gap-4 text-[#eaecef]">
      {/* Top Market Header */}
      <Header />

      {/* Mobile Tab Switcher (< lg screens) */}
      <div className="flex lg:hidden items-center justify-between bg-[#121721] p-1 rounded-xl border border-[#1e2638] shrink-0 text-xs font-semibold select-none">
        <div className="grid grid-cols-4 w-full gap-1">
          <button
            onClick={() => setMobileTab('chart')}
            className={`py-2 rounded-lg flex items-center justify-center transition-all cursor-pointer ${
              mobileTab === 'chart'
                ? 'bg-[#2563eb] text-white font-bold shadow-sm'
                : 'text-[#848e9c] hover:text-white hover:bg-[#181e2b]'
            }`}
          >
            Chart
          </button>

          <button
            onClick={() => setMobileTab('orderbook')}
            className={`py-2 rounded-lg flex items-center justify-center transition-all cursor-pointer ${
              mobileTab === 'orderbook'
                ? 'bg-[#2563eb] text-white font-bold shadow-sm'
                : 'text-[#848e9c] hover:text-white hover:bg-[#181e2b]'
            }`}
          >
            Book
          </button>

          <button
            onClick={() => setMobileTab('trades')}
            className={`py-2 rounded-lg flex items-center justify-center transition-all cursor-pointer ${
              mobileTab === 'trades'
                ? 'bg-[#2563eb] text-white font-bold shadow-sm'
                : 'text-[#848e9c] hover:text-white hover:bg-[#181e2b]'
            }`}
          >
            Trades
          </button>

          <button
            onClick={() => setMobileTab('split')}
            className={`py-2 rounded-lg flex items-center justify-center transition-all cursor-pointer ${
              mobileTab === 'split'
                ? 'bg-[#2563eb] text-white font-bold shadow-sm'
                : 'text-[#848e9c] hover:text-white hover:bg-[#181e2b]'
            }`}
          >
            Split
          </button>
        </div>
      </div>

      {/* Main Trading Area */}
      <div className="flex flex-1 min-h-0 gap-3 sm:gap-4 overflow-hidden flex-col lg:flex-row">
        {/* Candlestick Chart Area */}
        <main
          className={`min-w-0 rounded-xl border border-[#1e2638] bg-[#0e131d] overflow-hidden shadow-lg ${
            mobileTab === 'chart'
              ? 'flex-1 h-full flex flex-col'
              : mobileTab === 'split'
                ? 'h-[46%] shrink-0 flex flex-col'
                : 'hidden'
          } lg:flex lg:flex-1 lg:h-full`}
        >
          <Chart />
        </main>

        {/* Mobile Full Order Book view */}
        <div
          className={`lg:hidden min-h-0 rounded-xl border border-[#1e2638] bg-[#121721] overflow-hidden shadow-lg flex-1 ${
            mobileTab === 'orderbook' ? 'flex flex-col' : 'hidden'
          }`}
        >
          <OrderBook />
        </div>

        {/* Mobile Full Trades view */}
        <div
          className={`lg:hidden min-h-0 rounded-xl border border-[#1e2638] bg-[#121721] overflow-hidden shadow-lg flex-1 ${
            mobileTab === 'trades' ? 'flex flex-col' : 'hidden'
          }`}
        >
          <Trades />
        </div>

        {/* Mobile Split View (Bottom half: OrderBook or Trades with toggle) */}
        {mobileTab === 'split' && (
          <div className="lg:hidden flex-1 min-h-0 rounded-xl border border-[#1e2638] bg-[#121721] overflow-hidden shadow-lg flex flex-col">
            {/* Mini sub-tabs */}
            <div className="flex items-center justify-between px-3 py-1.5 border-b border-[#1e2638] bg-[#161c28]/60 shrink-0">
              <div className="inline-flex items-center gap-1 rounded-md bg-[#121721] p-0.5 border border-[#1e2638]">
                <button
                  onClick={() => setSplitSubTab('book')}
                  className={`text-[11px] font-bold px-2.5 py-0.5 rounded transition-all cursor-pointer ${
                    splitSubTab === 'book'
                      ? 'bg-[#2563eb] text-white shadow-sm'
                      : 'text-[#848e9c] hover:text-white'
                  }`}
                >
                  Order Book
                </button>
                <button
                  onClick={() => setSplitSubTab('trades')}
                  className={`text-[11px] font-bold px-2.5 py-0.5 rounded transition-all cursor-pointer ${
                    splitSubTab === 'trades'
                      ? 'bg-[#2563eb] text-white shadow-sm'
                      : 'text-[#848e9c] hover:text-white'
                  }`}
                >
                  Trades
                </button>
              </div>
              <span className="text-[10px] text-[#848e9c] font-mono">Split View</span>
            </div>

            <div className="flex-1 min-h-0 overflow-hidden">
              {splitSubTab === 'book' ? <OrderBook /> : <Trades />}
            </div>
          </div>
        )}

        {/* Desktop Right Sidebar: Order Book & Recent Trades — resizable */}
        <aside
          ref={sidebarRef}
          className="hidden lg:flex w-[360px] xl:w-[390px] shrink-0 flex-col h-full overflow-hidden"
          style={{ gap: 0 }}
        >
          {/* Order Book panel */}
          <div
            className="min-h-0 rounded-xl border border-[#1e2638] bg-[#121721] overflow-hidden shadow-lg"
            style={{ flex: `${splitPct} 1 0%` }}
          >
            <OrderBook />
          </div>

          {/* Drag handle */}
          <div
            onMouseDown={onMouseDown}
            className="group shrink-0 flex items-center justify-center cursor-row-resize py-1 select-none"
            title="Drag to resize"
          >
            <div className="w-10 h-1 rounded-full bg-[#1e2638] group-hover:bg-[#4a90d9] transition-colors duration-150" />
          </div>

          {/* Recent Trades panel */}
          <div
            className="min-h-0 rounded-xl border border-[#1e2638] bg-[#121721] overflow-hidden shadow-lg"
            style={{ flex: `${100 - splitPct} 1 0%` }}
          >
            <Trades />
          </div>
        </aside>
      </div>

      {/* Bottom Telemetry Dock */}
      <DebugPanel />
    </div>
  );
}
