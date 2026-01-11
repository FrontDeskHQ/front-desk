"use client";

import { useEffect, useRef, useState } from "react";

const REACT_SCAN_ENABLED_KEY = "devtools-react-scan-enabled";

export const useReactScanEnabled = () => {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const stored = localStorage.getItem(REACT_SCAN_ENABLED_KEY);
    const isEnabled = stored === "true";
    setEnabled(isEnabled);
  }, []);

  const setReactScanEnabled = (value: boolean) => {
    if (typeof window === "undefined") return;

    localStorage.setItem(REACT_SCAN_ENABLED_KEY, String(value));
    setEnabled(value);
  };

  return [enabled, setReactScanEnabled] as const;
};

export const ReactScan = () => {
  const [enabled] = useReactScanEnabled();
  console.log("enabled", enabled);
  const isInitializedRef = useRef(false);
  const setOptionsRef = useRef<
    ((options: { enabled: boolean }) => void) | null
  >(null);

  useEffect(() => {
    // Lazy load react-scan only when enabled for the first time
    if (enabled && !isInitializedRef.current) {
      const loadReactScan = async () => {
        try {
          const { scan, setOptions } = await import("react-scan");
          scan({
            enabled: true,
            showToolbar: true,
          });
          isInitializedRef.current = true;
          setOptionsRef.current = setOptions;
        } catch (error) {
          console.error("Failed to load react-scan:", error);
        }
      };

      loadReactScan();
    } else if (isInitializedRef.current && setOptionsRef.current) {
      // Update options dynamically if already initialized
      setOptionsRef.current({ enabled });
    }
  }, [enabled]);

  return null;
};
