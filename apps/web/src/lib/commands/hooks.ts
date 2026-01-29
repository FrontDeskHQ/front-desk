import { useAtomValue, useSetAtom } from "jotai/react";
import { useCallback, useEffect, useMemo } from "react";
import { commandRegistryActions, commandRegistryAtom } from "./registry";
import type { Command, CommandContext, CommandPage } from "./types";

/**
 * Hook to register a command in the command registry.
 * Uses a factory function pattern with explicit dependencies.
 *
 * @param factory - Factory function that returns the command object
 * @param deps - Array of dependencies that should trigger re-registration
 */
export const useCommand = (
  factory: () => Command,
  deps: readonly unknown[],
) => {
  const setRegistry = useSetAtom(commandRegistryAtom);

  useEffect(() => {
    const command = factory();

    setRegistry((state) =>
      commandRegistryActions.registerCommand(state, command),
    );

    return () => {
      setRegistry((state) =>
        commandRegistryActions.unregisterCommand(state, command.id),
      );
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setRegistry, ...deps]);
};

/**
 * Hook to register a command page in the command registry.
 * Uses a factory function pattern with explicit dependencies.
 *
 * @param factory - Factory function that returns the page object
 * @param deps - Array of dependencies that should trigger re-registration
 */
export const useCommandPage = (
  factory: () => CommandPage,
  deps: readonly unknown[],
) => {
  const setRegistry = useSetAtom(commandRegistryAtom);

  useEffect(() => {
    const page = factory();

    setRegistry((state) => commandRegistryActions.registerPage(state, page));

    return () => {
      setRegistry((state) =>
        commandRegistryActions.unregisterPage(state, page.id),
      );
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setRegistry, ...deps]);
};

/**
 * Hook to register a command context in the command registry.
 * Uses a factory function pattern with explicit dependencies.
 * Combines registration and activation in a single atomic operation.
 *
 * @param factory - Factory function that returns the context object
 * @param options - Options object with active flag and deps array
 */
export const useCommandContext = (
  factory: () => CommandContext,
  options: { active?: boolean; deps: readonly unknown[] },
) => {
  const { active = true, deps } = options;
  const setRegistry = useSetAtom(commandRegistryAtom);

  useEffect(() => {
    const context = factory();

    // Atomic batch: register + optionally activate
    setRegistry((state) => {
      let newState = commandRegistryActions.registerContext(state, context);
      if (active) {
        newState = commandRegistryActions.setContext(newState, context.id);
      }
      return newState;
    });

    return () => {
      setRegistry((state) => {
        let newState = state;
        if (state.currentContextId === context.id) {
          newState = commandRegistryActions.setContext(newState, null);
        }
        return commandRegistryActions.unregisterContext(newState, context.id);
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setRegistry, active, ...deps]);
};

/**
 * Hook to access and manipulate the command menu state.
 * Computes values directly from registry without intermediate memoization.
 */
export const useCommandMenu = () => {
  const registry = useAtomValue(commandRegistryAtom);
  const setRegistry = useSetAtom(commandRegistryAtom);

  // Stable callbacks (setRegistry is already stable from jotai)
  const navigateToPage = useCallback(
    (pageId: string | null) => {
      setRegistry((state) => commandRegistryActions.setPage(state, pageId));
    },
    [setRegistry],
  );

  const goBack = useCallback(() => {
    setRegistry((state) => {
      const currentPage = commandRegistryActions.getCurrentPage(state);
      currentPage?.onBack?.();
      return commandRegistryActions.goBack(state);
    });
  }, [setRegistry]);

  const setContext = useCallback(
    (contextId: string | null) => {
      setRegistry((state) =>
        commandRegistryActions.setContext(state, contextId),
      );
    },
    [setRegistry],
  );

  const resetNavigation = useCallback(() => {
    setRegistry((state) => commandRegistryActions.resetNavigation(state));
  }, [setRegistry]);

  const setSearch = useCallback(
    (search: string) => {
      setRegistry((state) => commandRegistryActions.setSearch(state, search));
    },
    [setRegistry],
  );

  // Compute directly from registry - no intermediate memos
  const commands = commandRegistryActions.getAvailableCommands(registry);
  const currentPage = commandRegistryActions.getCurrentPage(registry);

  const contextCommands = registry.currentContextId
    ? (registry.contexts[registry.currentContextId]?.commands ?? [])
    : [];

  const globalCommands = registry.globalCommands.filter(
    (cmd) => !cmd.contextId || cmd.contextId === registry.currentContextId,
  );

  const currentContextFooter = registry.currentContextId
    ? registry.contexts[registry.currentContextId]?.footer
    : undefined;

  // Single memoized return object
  return useMemo(
    () => ({
      commands,
      contextCommands,
      globalCommands,
      currentPage,
      currentContextId: registry.currentContextId,
      currentPageId: registry.currentPageId,
      lastDeclaredContextId: registry.lastDeclaredContextId,
      search: registry.search,
      currentContextFooter,
      registry,
      navigateToPage,
      goBack,
      setContext,
      resetNavigation,
      setSearch,
    }),
    [
      commands,
      contextCommands,
      globalCommands,
      currentPage,
      registry,
      navigateToPage,
      goBack,
      setContext,
      resetNavigation,
      setSearch,
    ],
  );
};
