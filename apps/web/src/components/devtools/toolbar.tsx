"use client";

import { LiveStateLog } from "./live-state-log";

export const Toolbar = () => {
  return (
    <div className="w-screen h-6 bg-background-secondary border-t shrink-0 flex font-mono gap-2 items-center px-2 z-10">
      <LiveStateLog />
    </div>
  );
};
