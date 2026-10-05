"use client";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { CandlestickSeries, ColorType, LineSeries, createChart, type UTCTimestamp } from "lightweight-charts";

function themeKey(): string {
  return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}
function subscribeTheme(cb: () => void) {
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

function css(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function baseOptions() {
  return {
    autoSize: true,
    layout: { background: { type: ColorType.Solid, color: css("--surface") }, textColor: css("--muted"), fontFamily: "inherit" },
    grid: { vertLines: { color: css("--line") }, horzLines: { color: css("--line") } },
    rightPriceScale: { borderColor: css("--line") },
    timeScale: { borderColor: css("--line"), timeVisible: true },
  };
}

type Candle = { time: number; open: number; high: number; low: number; close: number };

export function PriceChart({ candles, label }: { candles: Candle[]; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const theme = useSyncExternalStore(subscribeTheme, themeKey, () => "light");

  useEffect(() => {
    if (!ref.current || candles.length === 0) return;
    const chart = createChart(ref.current, baseOptions());
    const series = chart.addSeries(CandlestickSeries, {
      upColor: css("--buy"),
      downColor: css("--sell"),
      wickUpColor: css("--buy"),
      wickDownColor: css("--sell"),
      borderVisible: false,
    });
    series.setData(candles.map((c) => ({ ...c, time: c.time as UTCTimestamp })));
    chart.timeScale().fitContent();
    return () => chart.remove();
  }, [candles, theme]);

  return <div ref={ref} role="img" aria-label={label} className="h-72 w-full sm:h-80" />;
}

export function EquityChart({ points, label }: { points: { time: number; equity: number }[]; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const theme = useSyncExternalStore(subscribeTheme, themeKey, () => "light");

  useEffect(() => {
    if (!ref.current || points.length < 2) return;
    const chart = createChart(ref.current, baseOptions());
    const series = chart.addSeries(LineSeries, { color: css("--brass"), lineWidth: 2 });
    series.setData(points.map((p) => ({ time: p.time as UTCTimestamp, value: p.equity * 100 })));
    chart.timeScale().fitContent();
    return () => chart.remove();
  }, [points, theme]);

  return <div ref={ref} role="img" aria-label={label} className="h-56 w-full sm:h-64" />;
}
