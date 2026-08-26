import { describe, expect, it } from "vitest";

import { commandRegistryActions } from "./registry";
import type { CommandPage, CommandRegistryState } from "./types";

const emptyState: CommandRegistryState = {
  contexts: {},
  currentContextId: null,
  currentPageId: null,
  globalCommands: [],
  globalPages: {},
  history: [],
  lastDeclaredContextId: null,
  search: "",
};

const searchablePage: CommandPage = {
  commands: [
    { id: "create-thread", label: "Create thread", onSelect: () => undefined },
  ],
  id: "developer-tools.threads",
  label: "Threads",
  searchGroup: "Developer",
  searchKeywords: ["devtools"],
  searchable: true,
};

const listPage: CommandPage = {
  commands: [
    { id: "pr-1", label: "#1 Some pull request", onSelect: () => undefined },
  ],
  id: "developer-tools.github.prs",
  label: "Replay GitHub PR match",
};

describe("getSearchableCommands", () => {
  it("omits nested commands until the user is searching at the root", () => {
    const withPages: CommandRegistryState = {
      ...emptyState,
      globalPages: {
        [listPage.id]: listPage,
        [searchablePage.id]: searchablePage,
      },
    };

    expect(
      commandRegistryActions.getSearchableCommands(withPages)
    ).toStrictEqual([]);

    expect(
      commandRegistryActions.getSearchableCommands({
        ...withPages,
        currentPageId: searchablePage.id,
        search: "create",
      })
    ).toStrictEqual([]);
  });

  it("surfaces named commands from searchable pages, not unbounded lists", () => {
    const commands = commandRegistryActions.getSearchableCommands({
      ...emptyState,
      globalPages: {
        [listPage.id]: listPage,
        [searchablePage.id]: searchablePage,
      },
      search: "create",
    });

    expect(commands).toHaveLength(1);
    expect(commands[0]?.id).toBe("create-thread");
    expect(commands[0]?.group).toBe("Developer");
    expect(commands[0]?.keywords).toStrictEqual(["Threads", "devtools"]);
  });
});
