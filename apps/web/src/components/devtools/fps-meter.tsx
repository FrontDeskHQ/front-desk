"use client";

import { useEffect, useState } from "react";

export const FpsMeter = () => {
  const [fps, setFps] = useState(0);

  useEffect(() => {
    let frameCount = 0;
    let lastTime = performance.now();
    let animationFrameId: number;

    const measureFps = () => {
      frameCount++;
      const currentTime = performance.now();
      const elapsed = currentTime - lastTime;

      if (elapsed >= 1000) {
        const currentFps = Math.round((frameCount * 1000) / elapsed);
        setFps(currentFps);
        frameCount = 0;
        lastTime = currentTime;
      }

      animationFrameId = requestAnimationFrame(measureFps);
    };

    animationFrameId = requestAnimationFrame(measureFps);

    return () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, []);

  const getFpsColor = () => {
    if (fps >= 55) return "text-green-400 dark:text-green-600";
    if (fps >= 30) return "text-yellow-400 dark:text-yellow-600";
    return "text-red-400 dark:text-red-600";
  };

  return (
    <div className="flex items-center gap-1">
      <span className="text-foreground-secondary">FPS:</span>
      <span className={getFpsColor()}>{fps}</span>
    </div>
  );
};
