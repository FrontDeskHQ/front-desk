"use client";

import { useState } from "react";
import { DevtoolsMenu } from "./devtools-menu/devtools-menu";
import { FpsMeter } from "./fps-meter";
import { LiveStateLog } from "./live-state-log";
import { ReactScan } from "./react-scan";
import { ReflagFlagsMenu } from "./reflag-flags-menu";

type HideMode = "temporary" | "section" | null;

export const Toolbar = () => {
  const [hideMode, setHideMode] = useState<HideMode>(null);

  const handleHideToolbar = (mode: "temporary" | "section") => {
    setHideMode(mode);
  };

  const handleShowToolbar = () => {
    setHideMode(null);
  };

  if (hideMode === "section") {
    return null;
  }

  if (hideMode === "temporary") {
    return (
      <button
        type="button"
        onClick={handleShowToolbar}
        className="fixed bottom-0 left-1/2 -translate-x-1/2 mb-2 px-3 py-1 bg-background-secondary border border-border rounded text-xs font-mono hover:bg-background-tertiary transition-colors outline-none focus-visible:ring-1 focus-visible:ring-ring z-50"
        aria-label="Show toolbar"
      >
        Show Toolbar
      </button>
    );
  }

  return (
    <>
      <div className="w-screen h-6 bg-background-secondary border-t shrink-0 flex font-mono text-xs gap-2 items-center px-8 z-10">
        <FpsMeter />
        <div className="bg-border w-px h-4" />
        <DevtoolsMenu onHideToolbar={handleHideToolbar} />
        <div className="bg-border w-px h-4" />
        <ReflagFlagsMenu />
        <div className="bg-border w-px h-4" />
        <LiveStateLog />
      </div>
      <ReactScan />
    </>
  );
};
