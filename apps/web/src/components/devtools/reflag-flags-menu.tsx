"use client";

import {
  Menu,
  MenuCheckboxItem,
  MenuContent,
  MenuTrigger,
} from "@workspace/ui/components/menu";
import { useEffect, useState } from "react";
import { reflagClient } from "~/lib/feature-flag";

type FlagState = {
  isEnabled: boolean;
  flagKey: string;
};

export const ReflagFlagsMenu = () => {
  const [flags, setFlags] = useState<Record<string, FlagState>>({});
  const [isLoading, setIsLoading] = useState(true);

  const loadFlags = () => {
    try {
      const allFlags = reflagClient.getFlags();
      const flagsState: Record<string, FlagState> = {};

      for (const [flagKey, flag] of Object.entries(allFlags)) {
        flagsState[flagKey] = {
          isEnabled: (flag.isEnabled || flag.isEnabledOverride) ?? false,
          flagKey,
        };
      }

      setFlags(flagsState);
      setIsLoading(false);
    } catch (error) {
      console.error("Failed to load flags:", error);
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!reflagClient) {
      setIsLoading(false);
      return;
    }

    // Initial load
    loadFlags();

    // Listen to flag updates
    const unsubscribeFlagsUpdated = reflagClient.on("flagsUpdated", () => {
      loadFlags();
    });

    const unsubscribeStateUpdated = reflagClient.on("stateUpdated", () => {
      loadFlags();
    });

    return () => {
      if (typeof unsubscribeFlagsUpdated === "function") {
        unsubscribeFlagsUpdated();
      }
      if (typeof unsubscribeStateUpdated === "function") {
        unsubscribeStateUpdated();
      }
    };
  }, []);

  const handleToggleFlag = async (flagKey: string, currentState: boolean) => {
    try {
      await reflagClient.getFlag(flagKey).setIsEnabledOverride(!currentState);
      loadFlags();
    } catch (error) {
      console.error(`Failed to toggle flag ${flagKey}:`, error as Error);
    }
  };

  return (
    <Menu>
      <MenuTrigger className="h-5 px-2 hover:bg-background-tertiary rounded-sm transition-colors outline-none focus-visible:ring-1 focus-visible:ring-ring">
        Feature flags
      </MenuTrigger>
      <MenuContent>
        {isLoading ? (
          <div className="px-2 py-1.5 text-sm text-muted-foreground">
            Loading flags...
          </div>
        ) : Object.keys(flags).length === 0 ? (
          <div className="px-2 py-1.5 text-sm text-muted-foreground">
            No flags available
          </div>
        ) : (
          Object.entries(flags).map(([flagKey, flag]) => (
            <MenuCheckboxItem
              key={flagKey}
              checked={flag.isEnabled}
              onCheckedChange={() => handleToggleFlag(flagKey, flag.isEnabled)}
            >
              {flagKey}
            </MenuCheckboxItem>
          ))
        )}
      </MenuContent>
    </Menu>
  );
};
