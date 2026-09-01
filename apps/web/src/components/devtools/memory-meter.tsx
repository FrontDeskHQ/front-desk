"use client";

import { useEffect, useState } from "react";

import { Sparkline } from "./sparkline";

const BYTES_PER_MB = 1024 * 1024;
const MAX_MEMORY_HISTORY = 30;
const MIN_CHART_RANGE_MB = 32;
const SAMPLE_INTERVAL_MS = 1000;
const SMOOTHING = 0.3;

interface PerformanceMemory {
  jsHeapSizeLimit: number;
  totalJSHeapSize: number;
  usedJSHeapSize: number;
}

const getPerformanceMemory = (): PerformanceMemory | null => {
  const memory = (performance as Performance & { memory?: PerformanceMemory })
    .memory;

  if (!memory) {
    return null;
  }

  return memory;
};

const formatMegabytes = (bytes: number) => {
  const megabytes = bytes / BYTES_PER_MB;

  if (megabytes < 10) {
    return `${megabytes.toFixed(1)}MB`;
  }

  return `${Math.round(megabytes)}MB`;
};

export const MemoryMeter = () => {
  const [usedBytes, setUsedBytes] = useState(0);
  const [limitBytes, setLimitBytes] = useState(0);
  const [history, setHistory] = useState<number[]>([]);
  const [isSupported, setIsSupported] = useState(true);

  useEffect(() => {
    const sampleMemory = () => {
      const memory = getPerformanceMemory();

      if (!memory) {
        setIsSupported(false);
        return;
      }

      setIsSupported(true);
      setUsedBytes(memory.usedJSHeapSize);
      setLimitBytes(memory.jsHeapSizeLimit);
      setHistory((previousHistory) => {
        const usedMb = memory.usedJSHeapSize / BYTES_PER_MB;
        const previous = previousHistory.at(-1) ?? usedMb;
        const smoothed = previous + SMOOTHING * (usedMb - previous);

        return [...previousHistory, smoothed].slice(-MAX_MEMORY_HISTORY);
      });
    };

    sampleMemory();
    const intervalId = window.setInterval(sampleMemory, SAMPLE_INTERVAL_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  if (!isSupported) {
    return null;
  }

  const usageRatio = limitBytes > 0 ? usedBytes / limitBytes : 0;
  const getMemoryColor = () => {
    if (usageRatio < 0.5) {
      return "text-primary";
    }
    if (usageRatio < 0.8) {
      return "text-yellow-400 dark:text-yellow-600";
    }
    return "text-red-400 dark:text-red-600";
  };

  const label = `JS heap: ${formatMegabytes(usedBytes)} used of ${formatMegabytes(limitBytes)} limit`;
  const chartMin = history.length > 0 ? Math.min(...history) : 0;
  const chartMax =
    history.length > 0
      ? Math.max(Math.max(...history), chartMin + MIN_CHART_RANGE_MB)
      : MIN_CHART_RANGE_MB;

  return (
    <>
      <div className="bg-border w-px h-4" />
      <div aria-label={label} className="flex items-center gap-1" title={label}>
        <span className="text-foreground-secondary">MEM:</span>
        <span className={getMemoryColor()}>{formatMegabytes(usedBytes)}</span>
        <Sparkline
          className={`h-4 w-12 ${getMemoryColor()}`}
          max={chartMax}
          min={chartMin}
          series={[{ color: "currentColor", values: history }]}
        />
      </div>
    </>
  );
};
