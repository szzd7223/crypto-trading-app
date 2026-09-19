'use client';

import { useEffect, useRef, useCallback } from 'react';
import {
  createChart,
  CandlestickSeries,
  CrosshairMode,
  type IChartApi,
  type ISeriesApi,
  type CandlestickSeriesOptions,
  type DeepPartial,
} from 'lightweight-charts';
import { useStore } from '@/store';
import type { Interval, OHLCVCandle } from '@/types';
import { wsClient } from '@/lib/ws-client';

const INTERVALS: Interval[] = ['1m', '5m'];

function toBar(c: OHLCVCandle) {
  return {
    time: (c.openTime / 1000) as import('lightweight-charts').UTCTimestamp,
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
  };
}

const SERIES_OPTIONS: DeepPartial<CandlestickSeriesOptions> = {
  upColor:         '#16a34a',
  downColor:       '#dc2626',
  borderUpColor:   '#16a34a',
  borderDownColor: '#dc2626',
  wickUpColor:     '#16a34a',
  wickDownColor:   '#dc2626',
};

export default function Chart() {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef     = useRef<IChartApi | null>(null);
  const seriesRef    = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const tooltipRef   = useRef<HTMLDivElement>(null);

  const activeInterval = useStore(s => s.activeInterval);
  const candles1m      = useStore(s => s.candles1m);
  const candles5m      = useStore(s => s.candles5m);
  const isStale        = useStore(s => s.isStale);

  const candles = activeInterval === '1m' ? candles1m : candles5m;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const chart = createChart(el, {
      layout: {
        background: { color: '#ffffff' },
        textColor:  '#6b7280',
        fontFamily: 'Geist Mono, Menlo, monospace',
        fontSize:   12,
      },
      grid: {
        vertLines: { color: '#f3f4f6' },
        horzLines: { color: '#f3f4f6' },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: '#9ca3af', labelBackgroundColor: '#374151' },
        horzLine: { color: '#9ca3af', labelBackgroundColor: '#374151' },
      },
      rightPriceScale: { borderColor: '#e5e7eb' },
      timeScale: {
        borderColor:    '#e5e7eb',
        timeVisible:    true,
        secondsVisible: false,
      },
      handleScroll: true,
      handleScale:  true,
    });

    const series = chart.addSeries(CandlestickSeries, SERIES_OPTIONS);
    chartRef.current  = chart;
    seriesRef.current = series;

    chart.subscribeCrosshairMove((param) => {
      const tooltip = tooltipRef.current;
      if (!tooltip) return;
      if (!param.time || !param.point) { tooltip.style.opacity = '0'; return; }
      const bar = param.seriesData.get(series) as ReturnType<typeof toBar> | undefined;
      if (!bar) { tooltip.style.opacity = '0'; return; }

      const d   = new Date((param.time as number) * 1000);
      const ts  = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
      const chg = bar.close - bar.open;
      const col = chg >= 0 ? '#16a34a' : '#dc2626';

      tooltip.innerHTML = `
        <span style="color:#6b7280">${ts}</span>
        <span>O <b>${bar.open.toFixed(2)}</b></span>
        <span>H <b style="color:#16a34a">${bar.high.toFixed(2)}</b></span>
        <span>L <b style="color:#dc2626">${bar.low.toFixed(2)}</b></span>
        <span>C <b style="color:${col}">${bar.close.toFixed(2)}</b></span>
      `;
      tooltip.style.opacity = '1';
    });

    const ro = new ResizeObserver(() => {
      chart.applyOptions({ width: el.clientWidth, height: el.clientHeight });
    });
    ro.observe(el);

    return () => { ro.disconnect(); chart.remove(); };
  }, []);

  useEffect(() => {
    const series = seriesRef.current;
    if (!series || candles.length === 0) return;
    series.setData(candles.map(toBar));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeInterval, candles.length > 0 ? candles[0]!.openTime : 0]);

  useEffect(() => {
    const series = seriesRef.current;
    if (!series || candles.length === 0) return;
    series.update(toBar(candles[candles.length - 1]!));
  }, [candles]);

  const switchInterval = useCallback((iv: Interval) => wsClient.subscribe(iv), []);

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-200 shrink-0">
        {INTERVALS.map(iv => (
          <button
            key={iv}
            onClick={() => switchInterval(iv)}
            className={`text-sm font-medium px-3 py-1 rounded transition-all cursor-pointer
              ${activeInterval === iv
                ? 'bg-blue-600 text-white'
                : 'text-gray-500 hover:text-gray-800 hover:bg-gray-100'
              }`}
          >
            {iv}
          </button>
        ))}
        {isStale && (
          <span className="ml-auto text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded">
            STALE — reconnecting
          </span>
        )}
      </div>

      {/* Chart */}
      <div className="flex-1 relative min-h-0" ref={containerRef}>
        <div
          ref={tooltipRef}
          className="absolute top-3 left-3 z-10 flex gap-3 items-center font-mono text-xs text-gray-600 opacity-0 transition-opacity pointer-events-none bg-white/90 border border-gray-200 shadow-sm px-3 py-1.5 rounded"
        />
      </div>
    </div>
  );
}
