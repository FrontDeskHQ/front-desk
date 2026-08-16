import { useLayoutEffect, useRef, useState } from "react";

export type ToolbarMode = "reply" | "support-intelligence" | null;

/**
 * Exclusive toolbar modes. SI default-opens when the Agent has something to
 * show; reply is a detour that lands on `none` unless new Agent output arrived
 * while composing.
 */
export function useToolbarMode({
  ready,
  hasSomethingToShow,
  readFingerprint,
  labelKey,
}: {
  ready: boolean;
  hasSomethingToShow: boolean;
  readFingerprint: string | null;
  labelKey: string;
}) {
  const [mode, setMode] = useState<ToolbarMode>(null);
  const openSiWhenReplyClosesRef = useRef(false);
  const prevFingerprintRef = useRef<string | null>(null);
  const prevLabelKeyRef = useRef(labelKey);
  const hadShowableRef = useRef(false);
  const didInitRef = useRef(false);

  useLayoutEffect(() => {
    if (!ready) {
      return;
    }

    if (!didInitRef.current) {
      didInitRef.current = true;
      prevFingerprintRef.current = readFingerprint;
      prevLabelKeyRef.current = labelKey;
      hadShowableRef.current = hasSomethingToShow;
      if (hasSomethingToShow) {
        setMode("support-intelligence");
      }
      return;
    }

    const readArrived =
      readFingerprint !== null &&
      readFingerprint !== prevFingerprintRef.current;
    const prevLabelIds =
      prevLabelKeyRef.current === "" ? [] : prevLabelKeyRef.current.split(",");
    const nextLabelIds = labelKey === "" ? [] : labelKey.split(",");
    const newLabels = nextLabelIds.some((id) => !prevLabelIds.includes(id));

    if (readArrived || newLabels) {
      if (mode === "reply") {
        openSiWhenReplyClosesRef.current = true;
      } else if (mode === null) {
        setMode("support-intelligence");
      }
    }

    // What triggered the pending open can be dismissed or superseded while the
    // reply is still composing — don't land on an empty panel.
    if (!hasSomethingToShow) {
      openSiWhenReplyClosesRef.current = false;
    }

    if (
      mode === "support-intelligence" &&
      hadShowableRef.current &&
      !hasSomethingToShow
    ) {
      setMode(null);
    }

    prevFingerprintRef.current = readFingerprint;
    prevLabelKeyRef.current = labelKey;
    hadShowableRef.current = hasSomethingToShow;
  }, [hasSomethingToShow, labelKey, mode, readFingerprint, ready]);

  const exitReply = () => {
    const openSi = openSiWhenReplyClosesRef.current;
    openSiWhenReplyClosesRef.current = false;
    setMode(openSi ? "support-intelligence" : null);
  };

  const toggleReply = () => {
    if (mode === "reply") {
      exitReply();
      return;
    }
    setMode("reply");
  };

  const toggleSupportIntelligence = () => {
    if (mode === "support-intelligence") {
      setMode(null);
      return;
    }
    openSiWhenReplyClosesRef.current = false;
    setMode("support-intelligence");
  };

  return {
    mode,
    toggleReply,
    toggleSupportIntelligence,
    exitReply,
  };
}
