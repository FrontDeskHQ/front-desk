import { useAtomValue, useSetAtom } from "jotai/react";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { commandRegistryActions, commandRegistryAtom } from "./registry";
import type { Command, CommandContext, CommandPage } from "./types";

/**
 * Hook to register a command in the command registry.
 * The command object is tracked via ref, but only re-registers when stable dependencies change.
 *
 * @param command - The command object to register
 * @param deps - Array of stable primitive values (strings, numbers, booleans) that should trigger re-registration
 */
export const useCommand = (command: Command, deps: readonly unknown[] = []) => {
  const setRegistry = useSetAtom(commandRegistryAtom);
  const commandRef = useRef(command);

  // Create a stable signature of the command to detect when it changes
  // This includes primitive values that matter for registration
  const commandSignature = useMemo(() => {
    return JSON.stringify({
      id: command.id,
      group: command.group,
      contextId: command.contextId,
      disabled: command.disabled,
      checked: command.checked,
      // Note: We don't include functions or ReactNodes in the signature
      // as they change reference frequently but the registry action handles reference equality
    });
  }, [
    command.id,
    command.group,
    command.contextId,
    command.disabled,
    command.checked,
  ]);

  // Update ref whenever command changes
  useEffect(() => {
    commandRef.current = command;
  }, [command]);

  // Register/unregister command when stable dependencies change
  useEffect(() => {
    const currentCommand = commandRef.current;
    setRegistry((state) =>
      commandRegistryActions.registerCommand(state, currentCommand),
    );

    return () => {
      setRegistry((state) =>
        commandRegistryActions.unregisterCommand(state, currentCommand.id),
      );
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setRegistry, commandSignature, ...deps]);
};

/**
 * Hook to register a command page in the command registry.
 * The page object is tracked via ref, but only re-registers when stable dependencies change.
 *
 * @param page - The page object to register
 * @param deps - Optional array of stable primitive values that should trigger re-registration
 */
export const useCommandPage = (
  page: CommandPage,
  deps: readonly unknown[] = [],
) => {
  const setRegistry = useSetAtom(commandRegistryAtom);
  const pageRef = useRef(page);

  // Create a stable signature of the page to detect when it changes
  // Extract command IDs as a stable string - this will change when commands are added/removed/reordered
  // We compute the IDs string and use it as a dependency, ensuring we only recompute when IDs actually change
  const pageCommandIds = useMemo(() => {
    return page.commands
      .map((cmd) => cmd.id)
      .sort()
      .join(",");
  }, [
    // Use length to detect additions/removals, and compute IDs string for comparison
    // The join() creates a stable string that React can compare by value
    page.commands.length,
    // Create a stable string representation of command IDs
    // This will be the same string if IDs are the same, different if IDs changed
    page.commands
      .map((c) => c.id)
      .sort()
      .join(","),
  ]);

  const pageSignature = useMemo(() => {
    return JSON.stringify({
      id: page.id,
      label: page.label,
      commandIds: pageCommandIds,
    });
  }, [page.id, page.label, pageCommandIds]);

  // Update ref whenever page changes
  useEffect(() => {
    pageRef.current = page;
  }, [page]);

  // Register/unregister page when stable dependencies change
  useEffect(() => {
    const currentPage = pageRef.current;
    setRegistry((state) =>
      commandRegistryActions.registerPage(state, currentPage),
    );

    return () => {
      setRegistry((state) =>
        commandRegistryActions.unregisterPage(state, currentPage.id),
      );
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setRegistry, pageSignature, ...deps]);
};

/**
 * Hook to register a command context in the command registry.
 * The context object is tracked via ref, but only re-registers when stable dependencies change.
 *
 * @param context - The context object to register
 * @param active - Whether the context should be active
 * @param deps - Optional array of stable primitive values that should trigger re-registration
 */
export const useCommandContext = (
  context: CommandContext,
  active: boolean = true,
  deps: readonly unknown[] = [],
) => {
  const setRegistry = useSetAtom(commandRegistryAtom);
  const contextRef = useRef(context);
  const activeRef = useRef(active);

  // Create a stable signature of the context to detect when it changes
  // Extract command and page IDs as stable strings - these will change when commands/pages are added/removed
  const contextCommandIds = useMemo(() => {
    return context.commands
      .map((cmd) => cmd.id)
      .sort()
      .join(",");
  }, [
    // Use length to detect additions/removals, and compute IDs string for comparison
    context.commands.length,
    // Create a stable string representation of command IDs
    context.commands
      .map((c) => c.id)
      .sort()
      .join(","),
  ]);

  const contextPageIds = useMemo(() => {
    return context.pages ? Object.keys(context.pages).sort().join(",") : "";
  }, [
    // Use a stable string representation of page keys
    // This will be the same string if keys are the same, different if keys changed
    context.pages ? Object.keys(context.pages).sort().join(",") : "",
  ]);

  const contextSignature = useMemo(() => {
    return JSON.stringify({
      id: context.id,
      label: context.label,
      commandIds: contextCommandIds,
      pageIds: contextPageIds,
    });
  }, [context.id, context.label, contextCommandIds, contextPageIds]);

  // Update refs whenever context or active changes
  useEffect(() => {
    contextRef.current = context;
    activeRef.current = active;
  }, [context, active]);

  // Register/unregister context when stable dependencies change
  useEffect(() => {
    const currentContext = contextRef.current;
    setRegistry((state) =>
      commandRegistryActions.registerContext(state, currentContext),
    );

    return () => {
      setRegistry((state) =>
        commandRegistryActions.unregisterContext(state, currentContext.id),
      );
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setRegistry, active, contextSignature, ...deps]);

  // Set active context when active state changes
  useEffect(() => {
    if (activeRef.current) {
      setRegistry((state) =>
        commandRegistryActions.setContext(state, contextRef.current.id),
      );
    } else {
      setRegistry((state) => {
        if (state.currentContextId === contextRef.current.id) {
          return commandRegistryActions.setContext(state, null);
        }
        return state;
      });
    }
  }, [setRegistry, active, context.id]);
};

/**
 * Hook to access and manipulate the command menu state.
 * All computed values are memoized internally using stable primitive dependencies.
 */
export const useCommandMenu = () => {
  const registry = useAtomValue(commandRegistryAtom);
  const setRegistry = useSetAtom(commandRegistryAtom);

  // Extract stable primitive values for dependency arrays
  const currentPageId = registry.currentPageId;
  const currentContextId = registry.currentContextId;
  const lastDeclaredContextId = registry.lastDeclaredContextId;
  const search = registry.search;

  // Create stable signatures for contexts and pages to detect structural changes
  // These signatures change when contexts/pages are added/removed, not just when references change
  const contextsSignature = useMemo(() => {
    const keys = Object.keys(registry.contexts).sort();
    return keys.join(",");
  }, [registry.contexts]);

  const globalPagesSignature = useMemo(() => {
    const keys = Object.keys(registry.globalPages).sort();
    return keys.join(",");
  }, [registry.globalPages]);

  const globalCommandsCount = registry.globalCommands.length;

  // Create a signature for the current context's commands to detect command list changes
  // This signature changes when commands are added/removed/reordered in the current context
  const currentContextCommandsSignature = useMemo(() => {
    if (!currentContextId || !registry.contexts[currentContextId]) {
      return "";
    }
    const commands = registry.contexts[currentContextId].commands ?? [];
    return commands
      .map((cmd) => cmd.id)
      .sort()
      .join(",");
    // contextsSignature ensures we recompute when the contexts object structure changes
    // We read from registry.contexts but depend on contextsSignature which changes when structure changes
  }, [currentContextId, contextsSignature]);

  // Memoize commands using stable primitive dependencies
  // The signatures ensure we recompute when structure changes, and we read from the latest registry
  const commands = useMemo(
    () => commandRegistryActions.getAvailableCommands(registry),
    [
      currentPageId,
      currentContextId,
      contextsSignature,
      globalCommandsCount,
      globalPagesSignature,
      currentContextCommandsSignature,
      // registry is read inside - when atom updates, component re-renders and this recomputes if deps changed
    ],
  );

  // Memoize currentPage using stable primitive dependencies
  const currentPage = useMemo(
    () => commandRegistryActions.getCurrentPage(registry),
    [
      currentPageId,
      currentContextId,
      contextsSignature,
      globalPagesSignature,
      // registry is read inside - when atom updates, component re-renders and this recomputes if deps changed
    ],
  );

  // Memoize callback functions - setRegistry is stable from useSetAtom
  const navigateToPage = useCallback(
    (pageId: string | null) => {
      setRegistry((state) => commandRegistryActions.setPage(state, pageId));
    },
    [setRegistry],
  );

  const goBack = useCallback(() => {
    setRegistry((state) => {
      const currentPage = commandRegistryActions.getCurrentPage(state);
      if (currentPage?.onBack) {
        currentPage.onBack();
      }
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

  // Get context commands using stable dependencies
  // currentContextCommandsSignature changes when commands are added/removed/reordered
  // When useAtomValue causes re-render, registry is fresh, and signature ensures we recompute when structure changes
  const contextCommands = useMemo(() => {
    if (!currentContextId || !registry.contexts[currentContextId]) {
      return [];
    }
    return registry.contexts[currentContextId].commands ?? [];
    // Note: We read from registry but depend on signature - when atom updates, component re-renders
    // and if signature changed, we recompute with fresh registry
  }, [currentContextId, currentContextCommandsSignature]);

  // Get global commands using stable dependencies
  // globalCommandsCount changes when commands are added/removed
  // When useAtomValue causes re-render, registry is fresh, and count ensures we recompute when commands change
  const globalCommands = useMemo(() => {
    return registry.globalCommands.filter(
      (cmd) => !cmd.contextId || cmd.contextId === currentContextId,
    );
    // Note: We read from registry but depend on count - when atom updates, component re-renders
    // and if count changed, we recompute with fresh registry
  }, [currentContextId, globalCommandsCount]);

  // Get current context footer using stable dependencies
  // contextsSignature changes when contexts are added/removed
  // When useAtomValue causes re-render, registry is fresh, and signature ensures we recompute when contexts change
  const currentContextFooter = useMemo(() => {
    if (!currentContextId || !registry.contexts[currentContextId]) {
      return undefined;
    }
    return registry.contexts[currentContextId].footer;
    // Note: We read from registry but depend on signature - when atom updates, component re-renders
    // and if signature changed, we recompute with fresh registry
  }, [currentContextId, contextsSignature]);

  // Memoize the return object using stable primitive dependencies
  return useMemo(
    () => ({
      commands,
      contextCommands,
      globalCommands,
      currentPage,
      currentContextId,
      currentPageId,
      lastDeclaredContextId,
      search,
      currentContextFooter,
      registry, // Expose registry for command visibility checks
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
      currentContextId,
      currentPageId,
      lastDeclaredContextId,
      search,
      currentContextFooter,
      registry,
      navigateToPage,
      goBack,
      setContext,
      resetNavigation,
      setSearch,
    ],
  );
};
