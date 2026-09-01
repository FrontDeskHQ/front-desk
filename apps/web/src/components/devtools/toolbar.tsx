"use client";

import { getRouteApi } from "@tanstack/react-router";
import { Button } from "@workspace/ui/components/button";
import { cn } from "@workspace/ui/lib/utils";
import { useAtomValue, useSetAtom } from "jotai/react";
import { Wrench } from "lucide-react";
import { useState } from "react";

import { activeOrganizationAtom } from "~/lib/atoms";
import {
  commandMenuOpenAtom,
  commandRegistryActions,
  commandRegistryAtom,
} from "~/lib/commands/registry";
import { hasDeveloperToolAccess } from "~/lib/developer-tools/access";
import { useOrganizationSwitcher } from "~/lib/hooks/query/use-organization-switcher";

import {
  DEVELOPER_TOOLS_PAGE_ID,
  DeveloperToolsCommands,
} from "./developer-commands";
import { FpsMeter } from "./fps-meter";
import { LiveStateLog } from "./live-state-log";
import { LiveStateMetrics } from "./live-state-metrics";
import { MemoryMeter } from "./memory-meter";
import { ReactScan } from "./react-scan";

type HideMode = "temporary" | "section" | null;

export const Toolbar = () => {
  const [hideMode, setHideMode] = useState<HideMode>(null);
  const [liveStateLogOpen, setLiveStateLogOpen] = useState(false);
  const setCommandMenuOpen = useSetAtom(commandMenuOpenAtom);
  const setCommandRegistry = useSetAtom(commandRegistryAtom);
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
      <div
        className={cn(
          "flex h-6 w-screen shrink-0 items-center gap-2 px-8 text-xs z-10 border-t font-mono",
          isLocalEnvironment ? "bg-brand/40 border-white/20" : "bg-transparent"
        )}
      >
        <span
          aria-label={`Environment: ${isLocalEnvironment ? "local" : "production"}`}
          className="mr-5 font-mono"
        >
          {isLocalEnvironment ? "LOCALHOST" : "PROD"}
        </span>
        <div className="bg-border w-px h-4" />
        <FpsMeter />
        <div className="bg-border w-px h-4" />
        <LiveStateMetrics />
        <MemoryMeter />
        <div className="ml-auto flex items-center gap-2">
          <Button
            aria-label="Open developer tools command menu"
            className="h-5 px-2 rounded-sm font-mono text-xs"
            onClick={() => {
              setCommandRegistry((state) => {
                const reset = commandRegistryActions.resetNavigation(state);
                const cleared = commandRegistryActions.setSearch(reset, "");
                return commandRegistryActions.setPage(
                  cleared,
                  DEVELOPER_TOOLS_PAGE_ID
                );
              });
              setCommandMenuOpen(true);
            }}
            size="sm"
            variant="ghost"
          >
            <Wrench />
            Dev tools
          </Button>
          <div className="bg-border w-px h-4" />
          <LiveStateLog
            onOpenChange={setLiveStateLogOpen}
            open={liveStateLogOpen}
          />
        </div>
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
