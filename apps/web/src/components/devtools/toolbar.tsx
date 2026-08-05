"use client";

import { getRouteApi } from "@tanstack/react-router";
import { Button } from "@workspace/ui/components/button";
import { useAtomValue, useSetAtom } from "jotai/react";
import { Command as CommandIcon } from "lucide-react";
import { useState } from "react";

import { activeOrganizationAtom } from "~/lib/atoms";
import { commandMenuOpenAtom } from "~/lib/commands/registry";
import { hasDeveloperToolAccess } from "~/lib/developer-tools/access";
import { useOrganizationSwitcher } from "~/lib/hooks/query/use-organization-switcher";

import { DeveloperToolsCommands } from "./developer-commands";
import { FpsMeter } from "./fps-meter";
import { LiveStateLog } from "./live-state-log";
import { LiveStateMetrics } from "./live-state-metrics";
import { ReactScan } from "./react-scan";

type HideMode = "temporary" | "section" | null;

export const Toolbar = () => {
  const [hideMode, setHideMode] = useState<HideMode>(null);
  const [liveStateLogOpen, setLiveStateLogOpen] = useState(false);
  const setCommandMenuOpen = useSetAtom(commandMenuOpenAtom);
  const currentOrganization = useAtomValue(activeOrganizationAtom);
  const organizationId = currentOrganization?.id;
  const { organizationUsers } = useOrganizationSwitcher();
  const { user } = getRouteApi("/app").useRouteContext();
  const isLocalEnvironment = import.meta.env.DEV;

  const hasAccess = hasDeveloperToolAccess({
    isDevelopment: isLocalEnvironment,
    organizationId,
    organizationUsers,
    user,
  });

  const handleHideToolbar = (mode: "temporary" | "section") => {
    setHideMode(mode);
  };

  const handleShowToolbar = () => {
    setHideMode(null);
  };

  if (!hasAccess || !organizationId || hideMode === "section") {
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
        <span
          aria-label={`Environment: ${isLocalEnvironment ? "local" : "production"}`}
          className={
            isLocalEnvironment
              ? "rounded-sm bg-amber-400 px-1.5 py-0.5 text-[10px] font-bold leading-none text-amber-950"
              : "rounded-sm bg-emerald-700 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white"
          }
        >
          {isLocalEnvironment ? "LOCAL" : "PROD"}
        </span>
        <div className="bg-border w-px h-4" />
        <FpsMeter />
        <div className="bg-border w-px h-4" />
        <LiveStateMetrics />
        <div className="bg-border w-px h-4" />
        <Button
          aria-label="Open developer tools command menu"
          className="h-5 px-2 rounded-sm font-mono text-xs"
          onClick={() => setCommandMenuOpen(true)}
          size="sm"
          variant="ghost"
        >
          <CommandIcon />
          Command K
        </Button>
        <div className="bg-border w-px h-4" />
        <LiveStateLog
          onOpenChange={setLiveStateLogOpen}
          open={liveStateLogOpen}
        />
      </div>
      <DeveloperToolsCommands
        onHideToolbar={handleHideToolbar}
        onOpenLiveStateLog={() => setLiveStateLogOpen(true)}
        organizationId={organizationId}
      />
      <ReactScan />
    </>
  );
};
