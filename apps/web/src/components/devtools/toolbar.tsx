"use client";

import { DevtoolsMenu } from "./devtools-menu/devtools-menu";
import { FpsMeter } from "./fps-meter";
import { LiveStateLog } from "./live-state-log";
import { ReactScan } from "./react-scan";
import { ReflagFlagsMenu } from "./reflag-flags-menu";

export const Toolbar = () => {
  return (
    <>
      <div className="w-screen h-6 bg-background-secondary border-t shrink-0 flex font-mono text-xs gap-2 items-center px-8 z-10">
        <FpsMeter />
        <div className="bg-border w-px h-4" />
        <DevtoolsMenu />
        <div className="bg-border w-px h-4" />
        <ReflagFlagsMenu />
        <div className="bg-border w-px h-4" />
        <LiveStateLog />
      </div>
      <ReactScan />
    </>
  );
};
