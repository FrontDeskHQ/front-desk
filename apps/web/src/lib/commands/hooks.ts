import { useAtomValue, useSetAtom } from "jotai/react";
import { useEffect, useRef } from "react";
import { commandRegistryActions, commandRegistryAtom } from "./registry";
import type { Command, CommandContext, CommandPage } from "./types";

export const useCommand = (command: Command, deps: any[] = []) => {
  const setRegistry = useSetAtom(commandRegistryAtom);
  const commandRef = useRef(command);

  useEffect(() => {
    commandRef.current = command;
  }, [command]);

  useEffect(() => {
    const currentCommand = commandRef.current;
    setRegistry((state) =>
      commandRegistryActions.registerCommand(state, currentCommand)
    );

    return () => {
      setRegistry((state) =>
        commandRegistryActions.unregisterCommand(state, currentCommand.id)
      );
    };
  }, [setRegistry, ...deps]);
};

export const useCommandPage = (page: CommandPage) => {
  const setRegistry = useSetAtom(commandRegistryAtom);
  const pageRef = useRef(page);

  useEffect(() => {
    pageRef.current = page;
  }, [page]);

  useEffect(() => {
    const currentPage = pageRef.current;
    setRegistry((state) =>
      commandRegistryActions.registerPage(state, currentPage)
    );

    return () => {
      setRegistry((state) =>
        commandRegistryActions.unregisterPage(state, currentPage.id)
      );
    };
  }, [setRegistry, page]);
};

export const useCommandContext = (
  context: CommandContext,
  active: boolean = true,
  deps: any[] = []
) => {
  const setRegistry = useSetAtom(commandRegistryAtom);
  const contextRef = useRef(context);
  const activeRef = useRef(active);

  useEffect(() => {
    contextRef.current = context;
    activeRef.current = active;
  }, [context, active]);

  useEffect(() => {
    const currentContext = contextRef.current;
    setRegistry((state) =>
      commandRegistryActions.registerContext(state, currentContext)
    );

    return () => {
      setRegistry((state) =>
        commandRegistryActions.unregisterContext(state, currentContext.id)
      );
    };
  }, [setRegistry, active, ...deps]);

  useEffect(() => {
    if (activeRef.current) {
      setRegistry((state) =>
        commandRegistryActions.setContext(state, contextRef.current.id)
      );
    } else {
      setRegistry((state) => {
        if (state.currentContextId === contextRef.current.id) {
          return commandRegistryActions.setContext(state, null);
        }
        return state;
      });
    }
  }, [setRegistry, active]);
};

export const useCommandMenu = () => {
  const registry = useAtomValue(commandRegistryAtom);
  const setRegistry = useSetAtom(commandRegistryAtom);

  const commands = commandRegistryActions.getAvailableCommands(registry);
  const currentPage = commandRegistryActions.getCurrentPage(registry);

  const navigateToPage = (pageId: string | null) => {
    setRegistry((state) => commandRegistryActions.setPage(state, pageId));
  };

  const goBack = () => {
    setRegistry((state) => {
      const currentPage = commandRegistryActions.getCurrentPage(state);
      if (currentPage?.onBack) {
        currentPage.onBack();
      }
      return commandRegistryActions.goBack(state);
    });
  };

  const setContext = (contextId: string | null) => {
    setRegistry((state) => commandRegistryActions.setContext(state, contextId));
  };

  const resetNavigation = () => {
    setRegistry((state) => commandRegistryActions.resetNavigation(state));
  };

  const setSearch = (search: string) => {
    setRegistry((state) => commandRegistryActions.setSearch(state, search));
  };

  // Get context and global commands separately
  const contextCommands =
    registry.currentContextId && registry.contexts[registry.currentContextId]
      ? registry.contexts[registry.currentContextId].commands ?? []
      : [];
  const globalCommands = registry.globalCommands.filter(
    (cmd) => !cmd.contextId || cmd.contextId === registry.currentContextId
  );

  return {
    commands,
    contextCommands,
    globalCommands,
    currentPage,
    currentContextId: registry.currentContextId,
    currentPageId: registry.currentPageId,
    lastDeclaredContextId: registry.lastDeclaredContextId,
    search: registry.search,
    navigateToPage,
    goBack,
    setContext,
    resetNavigation,
    setSearch,
  };
};
