'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
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

function toVolumeBar(c: OHLCVCandle) {
  const isUp = c.close >= c.open;
  return {
    time: (c.openTime / 1000) as import('lightweight-charts').UTCTimestamp,
    value: c.volume,
    color: isUp ? 'rgba(14, 203, 129, 0.6)' : 'rgba(246, 70, 93, 0.6)',
  };
}

const CANDLE_SERIES_OPTIONS: DeepPartial<CandlestickSeriesOptions> = {
  upColor:         '#0ecb81',
  downColor:       '#f6465d',
  borderUpColor:   '#0ecb81',
  borderDownColor: '#f6465d',
  wickUpColor:     '#0ecb81',
  wickDownColor:   '#f6465d',
};

interface HoverBar {
  timeStr: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  change: number;
  changePct: number;
}

export default function Chart() {
  const containerRef    = useRef<HTMLDivElement>(null);
  const chartRef        = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);

  const activeInterval = useStore(s => s.activeInterval);
  const candles1m      = useStore(s => s.candles1m);
  const candles5m      = useStore(s => s.candles5m);
  const isStale        = useStore(s => s.isStale);

  const candles = activeInterval === '1m' ? candles1m : candles5m;

  const [hoveredBar, setHoveredBar] = useState<HoverBar | null>(null);

  // Initialize Chart
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const chart = createChart(el, {
      layout: {
        background: { color: '#0e131d' },
        textColor:  '#848e9c',
        fontFamily: 'Geist Mono, JetBrains Mono, Menlo, monospace',
        fontSize:   12,
        panes: {
          separatorColor: '#1e2638',
          separatorHoverColor: '#3b82f6',
          enableResize: true,
        },
      },
      grid: {
        vertLines: { color: '#161c28' },
        horzLines: { color: '#161c28' },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: '#3b82f6',
          width: 1,
          style: 3,
          labelBackgroundColor: '#1e2638',
        },
        horzLine: {
          color: '#3b82f6',
          width: 1,
          style: 3,
          labelBackgroundColor: '#1e2638',
        },
      },
      rightPriceScale: {
        borderColor: '#1e2638',
        scaleMargins: {
          top: 0.08,
          bottom: 0.08,
        },
      },
      timeScale: {
        borderColor:    '#1e2638',
        timeVisible:    true,
        secondsVisible: false,
        rightOffset:    8,
        barSpacing:     14,
        minBarSpacing:  4,
      },
      handleScroll: true,
      handleScale:  true,
    });

    // Candlestick Series (Price) - Main Pane 0
    const candleSeries = chart.addSeries(CandlestickSeries, CANDLE_SERIES_OPTIONS);
    candleSeriesRef.current = candleSeries;

    // Volume Histogram Series (V in OHLCV) - Dedicated Pane 1 with right Y-axis
    const volumeSeries = chart.addSeries(
      HistogramSeries,
      {
        priceFormat: {
          type: 'volume',
        },
        priceScaleId: 'right',
        title: 'Volume',
      },
      1
    );
    volumeSeries.priceScale().applyOptions({
      borderColor: '#1e2638',
      scaleMargins: {
        top: 0.15,
        bottom: 0,
      },
    });
    volumeSeriesRef.current = volumeSeries;

    // Set proportional heights: ~80% candlesticks, ~20% volume
    const panes = chart.panes();
    if (panes.length >= 2) {
      panes[0]?.setStretchFactor(4);
      panes[1]?.setStretchFactor(1);
    }

    chartRef.current = chart;

    // Crosshair listener for OHLCV HUD
    chart.subscribeCrosshairMove((param) => {
      if (!param.time || !param.point) {
        setHoveredBar(null);
        return;
      }
      const bar = param.seriesData.get(candleSeries) as ReturnType<typeof toBar> | undefined;
      if (!bar) {
        setHoveredBar(null);
        return;
      }

      const volBar = param.seriesData.get(volumeSeries) as { value: number } | undefined;
      const vol = volBar ? volBar.value : 0;

      const d   = new Date((param.time as number) * 1000);
      const ts  = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
      const chg = bar.close - bar.open;
      const pct = bar.open > 0 ? (chg / bar.open) * 100 : 0;

      setHoveredBar({
        timeStr: ts,
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
        volume: vol,
        change: chg,
        changePct: pct,
      });
    });

    const ro = new ResizeObserver(() => {
      chart.applyOptions({ width: el.clientWidth, height: el.clientHeight });
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      chart.remove();
    };
  }, []);

  // Update full dataset and fit view when interval or history loads
  useEffect(() => {
    const candleSeries = candleSeriesRef.current;
    const volumeSeries = volumeSeriesRef.current;
    const chart = chartRef.current;
    if (!candleSeries || !volumeSeries || !chart || candles.length === 0) return;

    candleSeries.setData(candles.map(toBar));
    volumeSeries.setData(candles.map(toVolumeBar));

    if (candles.length > 30) {
      chart.timeScale().fitContent();
    } else {
      chart.timeScale().applyOptions({ barSpacing: 16, rightOffset: 8 });
      chart.timeScale().scrollToRealTime();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeInterval, candles.length > 0 ? candles[0]!.openTime : 0]);

  // Live tick updates to the latest candle & volume
  useEffect(() => {
    const candleSeries = candleSeriesRef.current;
    const volumeSeries = volumeSeriesRef.current;
    if (!candleSeries || !volumeSeries || candles.length === 0) return;

    const last = candles[candles.length - 1]!;
    candleSeries.update(toBar(last));
    volumeSeries.update(toVolumeBar(last));
  }, [candles]);

  const switchInterval = useCallback((iv: Interval) => {
    wsClient.subscribe(iv);
  }, []);

  const handleFitContent = useCallback(() => {
    if (candles.length > 30) {
      chartRef.current?.timeScale().fitContent();
    } else {
      chartRef.current?.timeScale().applyOptions({ barSpacing: 16, rightOffset: 8 });
      chartRef.current?.timeScale().scrollToRealTime();
    }
  }, [candles.length]);

  // Compute active HUD display: either hovered bar or latest candle
  const activeHud = hoveredBar ?? (candles.length > 0 ? (() => {
    const last = candles[candles.length - 1]!;
    const d = new Date(last.openTime);
    const ts = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
    const chg = last.close - last.open;
    const pct = last.open > 0 ? (chg / last.open) * 100 : 0;
    return {
      timeStr: ts,
      open: last.open,
      high: last.high,
      low: last.low,
      close: last.close,
      volume: last.volume,
      change: chg,
      changePct: pct,
    };
  })() : null);

  return (
    <div className="flex flex-col h-full bg-[#0e131d]">
      {/* Chart Top Toolbar */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-[#1e2638] bg-[#121721] shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-sm text-[#94a3b8] font-semibold mr-1">Timeframe</span>
          <div className="inline-flex items-center gap-1 rounded-lg bg-[#181e2b] p-1 border border-[#1e2638]">
            {INTERVALS.map(iv => (
              <button
                key={iv}
                onClick={() => switchInterval(iv)}
                className={`text-sm font-bold px-3 py-1 rounded-md transition-all cursor-pointer ${
                  activeInterval === iv
                    ? 'bg-[#2563eb] text-white shadow-sm'
                    : 'text-[#848e9c] hover:text-white hover:bg-[#202838]'
                }`}
              >
                {iv}
              </button>
            ))}
          </div>

          <div className="h-5 w-px bg-[#1e2638] mx-2" />

          <button
            onClick={handleFitContent}
            title="Fit candles to window"
            className="text-sm font-semibold text-[#94a3b8] hover:text-white hover:bg-[#181e2b] px-3 py-1.5 rounded-md transition-colors cursor-pointer border border-[#1e2638]"
          >
            Reset Scale
          </button>
        </div>

        {/* Live / Stale connection warning */}
        {isStale && (
          <div className="flex items-center gap-2 px-3 py-1 rounded-md bg-[#f59e0b]/15 border border-[#f59e0b]/30 text-[#f59e0b] text-xs font-semibold">
            <span className="w-2 h-2 rounded-full bg-[#f59e0b] animate-pulse-dot" />
            STALE — Reconnecting
          </div>
        )}
      </div>

      {/* OHLCV Dynamic HUD Overlay Bar */}
      {activeHud && (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 px-5 py-2.5 bg-[#0e131d]/90 border-b border-[#161c28] text-sm font-mono select-none">
          <span className="text-[#848e9c] font-medium">{activeHud.timeStr}</span>
          <span className="text-[#848e9c]">
            O <span className="text-white font-semibold">{activeHud.open.toFixed(2)}</span>
          </span>
          <span className="text-[#848e9c]">
            H <span className="text-[#0ecb81] font-semibold">{activeHud.high.toFixed(2)}</span>
          </span>
          <span className="text-[#848e9c]">
            L <span className="text-[#f6465d] font-semibold">{activeHud.low.toFixed(2)}</span>
          </span>
          <span className="text-[#848e9c]">
            C{' '}
            <span
              className={`font-bold ${
                activeHud.change >= 0 ? 'text-[#0ecb81]' : 'text-[#f6465d]'
              }`}
            >
              {activeHud.close.toFixed(2)}
            </span>
          </span>
          <span className="text-[#848e9c]">
            V <span className="text-[#eaecef] font-semibold">{activeHud.volume.toFixed(2)} BTC</span>
          </span>
          <span
            className={`font-bold ${
              activeHud.change >= 0 ? 'text-[#0ecb81]' : 'text-[#f6465d]'
            }`}
          >
            {activeHud.change >= 0 ? '▲ +' : '▼ '}
            {activeHud.change.toFixed(2)} ({activeHud.changePct >= 0 ? '+' : ''}
            {activeHud.changePct.toFixed(2)}%)
          </span>
        </div>
      )}

      {/* Candlestick & Volume Canvas Container */}
      <div className="flex-1 relative min-h-0" ref={containerRef} />
    </div>
  );
}
