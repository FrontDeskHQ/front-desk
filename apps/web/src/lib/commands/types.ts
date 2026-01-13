import type { ReactNode } from "react";

export type CommandId = string;
export type PageId = string;
export type ContextId = string;

type BaseCommand = {
  id: CommandId;
  label: ReactNode;
  icon?: ReactNode;
  keywords?: string[];
  shortcut?: string;
  contextId?: ContextId; // If set, only shows in this context
  disabled?: boolean;
  group?: string; // Optional group label for organizing commands
  visible?: boolean | ((state: CommandRegistryState) => boolean);
  checked?: boolean;
};

export type PageCommand = BaseCommand & {
  pageId: PageId;
};

export type DirectCommand = BaseCommand & {
  onSelect: () => void;
};

export type Command = PageCommand | DirectCommand;

export interface CommandPage {
  id: PageId;
  label: string;
  icon?: ReactNode;
  commands: Command[];
  onBack?: () => void; // Custom back handler
}

export interface CommandContext {
  id: ContextId;
  footer?: ReactNode;
  label: string;
  commands: Command[];
  pages?: Record<PageId, CommandPage>;
}

export interface CommandRegistryState {
  contexts: Record<ContextId, CommandContext>;
  globalCommands: Command[];
  globalPages: Record<PageId, CommandPage>;
  currentContextId: ContextId | null;
  currentPageId: PageId | null;
  history: Array<{ type: "context" | "page"; id: string }>;
  lastDeclaredContextId: ContextId | null;
  search: string;
}
