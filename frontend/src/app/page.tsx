'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { wsClient } from '@/lib/ws-client';
import Header from '@/components/Header';
import OrderBook from '@/components/OrderBook';
import Trades from '@/components/Trades';
import DebugPanel from '@/components/DebugPanel';

const Chart = dynamic(() => import('@/components/Chart'), { ssr: false });

export default function TradingPage() {
  useEffect(() => {
    wsClient.connect();
    return () => wsClient.destroy();
  }, []);

  // splitPct = % of sidebar height given to the Order Book panel (0–100)
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
    <div className="flex flex-col h-screen overflow-hidden bg-[#07090e] p-4 sm:p-5 lg:px-7 lg:py-4 gap-3.5 sm:gap-4 text-[#eaecef]">
      {/* Top Market Header */}
      <Header />

      {/* Main Trading Area */}
      <div className="flex flex-1 min-h-0 gap-3.5 sm:gap-4 overflow-hidden">
        {/* Left: Candlestick Chart Area */}
        <main className="flex-1 min-w-0 h-full rounded-xl border border-[#1e2638] bg-[#0e131d] overflow-hidden shadow-lg">
          <Chart />
        </main>

        {/* Right Sidebar: Order Book & Recent Trades — resizable */}
        <aside
          ref={sidebarRef}
          className="w-[360px] xl:w-[390px] shrink-0 flex flex-col h-full overflow-hidden"
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
