import { atom } from "jotai";
import type {
  Command,
  CommandContext,
  CommandPage,
  CommandRegistryState,
  ContextId,
  PageId,
} from "./types";

const initialState: CommandRegistryState = {
  contexts: {},
  globalCommands: [],
  globalPages: {},
  currentContextId: null,
  currentPageId: null,
  history: [],
  lastDeclaredContextId: null,
  search: "",
};

export const commandRegistryAtom = atom<CommandRegistryState>(initialState);

export const commandRegistryActions = {
  registerCommand: (
    state: CommandRegistryState,
    command: Command,
  ): CommandRegistryState => {
    // Check if command already exists
    const existingIndex = state.globalCommands.findIndex(
      (c) => c.id === command.id,
    );
    if (existingIndex !== -1) {
      // If it's the same reference, don't update
      if (state.globalCommands[existingIndex] === command) {
        return state;
      }
      // Replace existing command
      const newCommands = [...state.globalCommands];
      newCommands[existingIndex] = command;
      return {
        ...state,
        globalCommands: newCommands,
      };
    }

    return {
      ...state,
      globalCommands: [...state.globalCommands, command],
    };
  },

  unregisterCommand: (
    state: CommandRegistryState,
    commandId: string,
  ): CommandRegistryState => {
    return {
      ...state,
      globalCommands: state.globalCommands.filter((c) => c.id !== commandId),
    };
  },

  registerPage: (
    state: CommandRegistryState,
    page: CommandPage,
  ): CommandRegistryState => {
    return {
      ...state,
      globalPages: {
        ...state.globalPages,
        [page.id]: page,
      },
    };
  },

  unregisterPage: (
    state: CommandRegistryState,
    pageId: PageId,
  ): CommandRegistryState => {
    const { [pageId]: _, ...restPages } = state.globalPages;
    return {
      ...state,
      globalPages: restPages,
    };
  },

  registerContext: (
    state: CommandRegistryState,
    context: CommandContext,
  ): CommandRegistryState => {
    // If context already exists and is the same reference, don't update
    const existingContext = state.contexts[context.id];
    if (existingContext === context) {
      return state;
    }

    return {
      ...state,
      contexts: {
        ...state.contexts,
        [context.id]: context,
      },
      lastDeclaredContextId: context.id,
    };
  },

  unregisterContext: (
    state: CommandRegistryState,
    contextId: ContextId,
  ): CommandRegistryState => {
    const { [contextId]: _, ...restContexts } = state.contexts;
    return {
      ...state,
      contexts: restContexts,
      // Reset context if it was active
      currentContextId:
        state.currentContextId === contextId ? null : state.currentContextId,
    };
  },

  setContext: (
    state: CommandRegistryState,
    contextId: ContextId | null,
  ): CommandRegistryState => {
    if (state.currentContextId === contextId) {
      return state;
    }

    const newHistory: Array<{ type: "context" | "page"; id: string }> =
      contextId &&
      !state.history.some((h) => h.type === "context" && h.id === contextId)
        ? [...state.history, { type: "context" as const, id: contextId }]
        : state.history;

    return {
      ...state,
      currentContextId: contextId,
      currentPageId: null, // Reset page when changing context
      history: newHistory,
    };
  },

  setPage: (
    state: CommandRegistryState,
    pageId: PageId | null,
  ): CommandRegistryState => {
    if (state.currentPageId === pageId) {
      return state;
    }

    const newHistory: Array<{ type: "context" | "page"; id: string }> = pageId
      ? [...state.history, { type: "page" as const, id: pageId }]
      : state.history;

    return {
      ...state,
      currentPageId: pageId,
      history: newHistory,
    };
  },

  goBack: (state: CommandRegistryState): CommandRegistryState => {
    if (state.history.length === 0) {
      return state;
    }

    const newHistory = [...state.history];
    const last = newHistory.pop();

    if (!last) {
      return state;
    }

    if (last.type === "page") {
      const previousPage = newHistory
        .slice()
        .reverse()
        .find((entry) => entry.type === "page");

      return {
        ...state,
        currentPageId: previousPage ? (previousPage.id as PageId) : null,
        history: newHistory,
      };
    }

    if (last.type === "context") {
      // Find the most recent context in the remaining history
      const previousContext = newHistory
        .slice()
        .reverse()
        .find((entry) => entry.type === "context");

      // When going back from a context, find the most recent page
      // that was set after the previous context (if any)
      let previousPage: { type: "context" | "page"; id: string } | undefined;
      if (previousContext) {
        // Find the index of the previous context in the history by comparing id
        const contextIndex = newHistory.findIndex(
          (entry) =>
            entry.type === "context" && entry.id === previousContext.id,
        );
        // Find pages that appear after this context
        const pagesAfterContext = newHistory
          .slice(contextIndex + 1)
          .filter((entry) => entry.type === "page");
        // Get the most recent page (last one in the filtered array)
        previousPage = pagesAfterContext[pagesAfterContext.length - 1];
      } else {
        // If no previous context, find the most recent page in all remaining history
        previousPage = newHistory
          .slice()
          .reverse()
          .find((entry) => entry.type === "page");
      }

      return {
        ...state,
        currentContextId: previousContext
          ? (previousContext.id as ContextId)
          : null,
        currentPageId: previousPage ? (previousPage.id as PageId) : null,
        history: newHistory,
      };
    }

    return state;
  },

  getAvailableCommands: (state: CommandRegistryState): Command[] => {
    if (state.currentPageId) {
      // First, check if page exists in current context's pages
      if (state.currentContextId) {
        const context = state.contexts[state.currentContextId];
        const page = context?.pages?.[state.currentPageId];
        if (page) {
          return page.commands;
        }
      }
      // Then check all contexts for the page (in case context was cleared but page remains)
      for (const context of Object.values(state.contexts)) {
        const page = context.pages?.[state.currentPageId];
        if (page) {
          return page.commands;
        }
      }
      // Finally, check global pages
      const globalPage = state.globalPages[state.currentPageId];
      if (globalPage) {
        return globalPage.commands;
      }
      // If page not found, return empty array
      return [];
    }

    if (state.currentContextId) {
      const context = state.contexts[state.currentContextId];
      const contextCommands = context?.commands ?? [];
      const globalCommands = state.globalCommands.filter(
        (cmd) => !cmd.contextId || cmd.contextId === state.currentContextId,
      );
      return [...contextCommands, ...globalCommands];
    }

    return state.globalCommands.filter((cmd) => !cmd.contextId);
  },

  getCurrentPage: (state: CommandRegistryState): CommandPage | null => {
    if (!state.currentPageId) {
      return null;
    }

    // First, check if page exists in current context's pages
    if (state.currentContextId) {
      const context = state.contexts[state.currentContextId];
      const page = context?.pages?.[state.currentPageId];
      if (page) {
        return page;
      }
    }
    // Then check all contexts for the page (in case context was cleared but page remains)
    for (const context of Object.values(state.contexts)) {
      const page = context.pages?.[state.currentPageId];
      if (page) {
        return page;
      }
    }
    // Finally, check global pages
    return state.globalPages[state.currentPageId] ?? null;
  },

  resetNavigation: (state: CommandRegistryState): CommandRegistryState => {
    return {
      ...state,
      currentContextId: state.lastDeclaredContextId,
      currentPageId: null,
      history: state.lastDeclaredContextId
        ? [{ type: "context" as const, id: state.lastDeclaredContextId }]
        : [],
      search: "",
    };
  },

  setSearch: (
    state: CommandRegistryState,
    search: string,
  ): CommandRegistryState => {
    return {
      ...state,
      search,
    };
  },
};
