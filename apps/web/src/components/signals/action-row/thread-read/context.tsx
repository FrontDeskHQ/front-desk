import type { InferLiveCollection } from "@live-state/sync";
import { useNavigate } from "@tanstack/react-router";
import { fingerprintAgentRead } from "@workspace/schemas/signals";
import type {
  Action,
  InlineSuggestion,
  ThreadRead as ThreadReadData,
} from "@workspace/schemas/signals";
import type { schema } from "api/schema";
import {
  createContext,
  use,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import { toast } from "sonner";

import { buildThreadParam } from "~/utils/thread";

import {
  acceptInlineSuggestion,
  acceptThreadRead,
  dismissInlineSuggestion,
  dismissThreadRead,
} from "../handlers";
import type { ActorContext } from "../handlers";
import {
  acceptToastMessage,
  formatErrorMessage,
  orderReplyFirst,
  primaryReplyDraftMarkdown,
} from "./helpers";
import type { SelectedAction } from "./helpers";

export type ThreadReadOrigin = "feed" | "thread";

const TOAST_ACTION_BUTTON_STYLE = {
  background: "transparent",
  border: "none",
  color: "hsl(var(--primary))",
  textDecoration: "underline",
} as const;

export type ThreadWithRelations = InferLiveCollection<
  typeof schema.thread,
  {
    author: { include: { user: true } };
    assignedUser: { include: { user: true } };
  }
>;

export type ThreadWithAgentRead = ThreadWithRelations & {
  agentRead: ThreadReadData;
};

type ReplyTarget = { kind: "primary" } | { kind: "alternative"; index: number };

export interface ThreadReadState {
  thread: ThreadWithAgentRead;
  read: ThreadReadData;
  busyKey: string | null;
  replyTarget: ReplyTarget | null;
  replyEditorOpen: boolean;
  editingPrimaryReply: boolean;
  editingAlternativeReply: boolean;
  selectedIndices: ReadonlySet<number>;
  replyDraft: string;
  replyEditorRevision: number;
  readFingerprint: string;
  inlineSuggestions: InlineSuggestion[];
  orderedSelected: SelectedAction[];
  isCompound: boolean;
  replyIndex: number;
  visibleAlternatives: { alternative: Action; index: number }[];
}

export interface ThreadReadActions {
  handleDraftChange: (draft: string) => void;
  handlePrimaryClick: () => void;
  handleCancelReplyEditor: () => void;
  handleSendReply: () => void;
  handleToggleAction: (index: number) => void;
  handleAlternativeClick: (index: number) => void;
  handleDismissRead: () => void;
  handleInlineAccept: (suggestion: InlineSuggestion) => Promise<void>;
  handleInlineDismiss: (suggestion: InlineSuggestion) => Promise<void>;
}

export interface ThreadReadMeta {
  ctx: ActorContext;
}

export interface ThreadReadContextValue {
  state: ThreadReadState;
  actions: ThreadReadActions;
  meta: ThreadReadMeta;
}

const ThreadReadContext = createContext<ThreadReadContextValue | null>(null);

export function useThreadRead(): ThreadReadContextValue {
  const value = use(ThreadReadContext);
  if (!value) {
    throw new Error("ThreadRead.* used outside <ThreadRead.Provider>");
  }
  return value;
}

export function ThreadReadProvider({
  thread,
  ctx,
  origin = "thread",
  children,
}: {
  thread: ThreadWithAgentRead;
  ctx: ActorContext;
  origin?: ThreadReadOrigin;
  children: ReactNode;
}) {
  const navigate = useNavigate();
  const [busyKey, setBusyKey] = useState<string | null>(null);
  // Which reply is being previewed/edited: the primary bundle's reply, or a
  // specific alternative reply. Both open the same inline draft editor.
  const [replyTarget, setReplyTarget] = useState<ReplyTarget | null>(null);
  const replyEditorOpen = replyTarget !== null;
  const editingPrimaryReply = replyTarget?.kind === "primary";
  const editingAlternativeReply = replyTarget?.kind === "alternative";
  const read = thread.agentRead;
  const readFingerprint = fingerprintAgentRead(read);
  const replyIndex = read.primary.findIndex(
    (action) => action.kind === "reply"
  );
  const isCompound = read.primary.length > 1;
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(
    () => new Set(read.primary.map((_, index) => index))
  );
  const [replyDraft, setReplyDraft] = useState(() =>
    primaryReplyDraftMarkdown(read.primary)
  );
  const [replyEditorRevision, setReplyEditorRevision] = useState(0);
  const inlineSuggestions = (thread.inlineSuggestions ?? []).filter(
    (suggestion) =>
      !suggestion.dismissedAt &&
      // `apply_label` is the only kind the inline track writes (ADR 0014), and
      // the row below reads `action.labelId`. Rows persisted by the retired
      // status track would otherwise render as an "Unknown label" chip.
      suggestion.action.kind === "apply_label"
  );

  const primaryActionsRef = useRef(read.primary);
  primaryActionsRef.current = read.primary;

  // Fingerprint already covers primary/alternatives content. Depending on
  // `read.primary` resets every card on each live-query identity change.
  useEffect(() => {
    const primary = primaryActionsRef.current;
    setReplyTarget(null);
    setSelectedIndices(new Set(primary.map((_, index) => index)));
    setReplyDraft(primaryReplyDraftMarkdown(primary));
    setReplyEditorRevision((revision) => revision + 1);
  }, [readFingerprint]);

  const orderedSelected = useMemo(
    () => orderReplyFirst(read.primary, selectedIndices),
    [read.primary, selectedIndices]
  );
  const selectionIncludesReply =
    replyIndex !== -1 && selectedIndices.has(replyIndex);

  // When the primary bundle is a lone reply, a reply-only alternative is
  // redundant — it offers the same "just reply" as the primary — so drop it.
  // Indices are kept intact so accept/edit handlers still map to read.alternatives.
  const primaryIsJustReply =
    read.primary.length === 1 && read.primary[0]?.kind === "reply";
  const visibleAlternatives = useMemo(
    () =>
      (read.alternatives ?? [])
        .map((alternative, index) => ({ alternative, index }))
        .filter(
          ({ alternative }) =>
            !(primaryIsJustReply && alternative.kind === "reply")
        ),
    [read.alternatives, primaryIsJustReply]
  );

  const showAcceptToast = (actions: Action[]) => {
    const message = acceptToastMessage(actions);
    if (origin === "feed") {
      toast.success(message, {
        duration: 10_000,
        action: {
          label: "See thread",
          onClick: () =>
            navigate({
              params: { id: buildThreadParam(thread) },
              to: "/app/threads/$id",
            }),
        },
        actionButtonStyle: TOAST_ACTION_BUTTON_STYLE,
      });
      return;
    }
    toast.success(message);
  };

  const handleAcceptSelected = async (replyDraftValue?: string) => {
    const indices = [...selectedIndices].toSorted((a, b) => a - b);
    if (indices.length === 0) {
      return;
    }
    const accepted = orderedSelected.map(({ action }) => action);
    setBusyKey("primary");
    try {
      await acceptThreadRead({
        ctx,
        read,
        replyDraft: replyDraftValue,
        selection: { primaryActionIndices: indices },
        threadId: thread.id,
      });
      setReplyTarget(null);
      showAcceptToast(accepted);
    } catch (error) {
      toast.error(formatErrorMessage(error));
    } finally {
      setBusyKey(null);
    }
  };

  const handlePrimaryClick = () => {
    if (selectionIncludesReply) {
      // Reseed the shared draft so an earlier alternative-reply flow can't leak
      // stale text into the primary editor.
      setReplyDraft(primaryReplyDraftMarkdown(read.primary));
      setReplyEditorRevision((revision) => revision + 1);
      setReplyTarget({ kind: "primary" });
      return;
    }
    void handleAcceptSelected();
  };

  const handleCancelReplyEditor = () => {
    setReplyTarget(null);
    setReplyDraft(primaryReplyDraftMarkdown(read.primary));
    setReplyEditorRevision((revision) => revision + 1);
  };

  const handleAcceptAlternative = async (
    alternativeIndex: number,
    replyDraftValue?: string
  ) => {
    const alternative = read.alternatives?.[alternativeIndex];
    setBusyKey(`alt:${alternativeIndex}`);
    try {
      await acceptThreadRead({
        ctx,
        read,
        replyDraft: replyDraftValue,
        selection: { alternativeIndex },
        threadId: thread.id,
      });
      setReplyTarget(null);
      showAcceptToast(alternative ? [alternative] : []);
    } catch (error) {
      toast.error(formatErrorMessage(error));
    } finally {
      setBusyKey(null);
    }
  };

  const handleSendReply = () => {
    const trimmed = replyDraft.trim();
    if (trimmed.length === 0) {
      return;
    }
    if (replyTarget?.kind === "alternative") {
      void handleAcceptAlternative(replyTarget.index, trimmed);
      return;
    }
    void handleAcceptSelected(trimmed);
  };

  const toggleAction = (index: number) => {
    // The primary reply stays locked-in while its editor is expanded.
    if (editingPrimaryReply && index === replyIndex) {
      return;
    }
    setSelectedIndices((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  // A reply alternative opens the same inline preview editor as the primary
  // reply (seeded with its own draft); any other alternative applies directly.
  const handleAlternativeClick = (alternativeIndex: number) => {
    const alternative = read.alternatives?.[alternativeIndex];
    if (alternative?.kind === "reply") {
      setReplyTarget({ index: alternativeIndex, kind: "alternative" });
      setReplyDraft(alternative.draftMarkdown ?? "");
      setReplyEditorRevision((revision) => revision + 1);
      return;
    }
    void handleAcceptAlternative(alternativeIndex);
  };

  const handleDismissRead = async () => {
    setBusyKey("dismiss");
    try {
      await dismissThreadRead({
        ctx,
        read,
        threadId: thread.id,
      });
    } catch (error) {
      toast.error(formatErrorMessage(error));
    } finally {
      setBusyKey(null);
    }
  };

  const handleInlineAccept = async (suggestion: InlineSuggestion) => {
    setBusyKey(`inline:accept:${suggestion.id}`);
    try {
      await acceptInlineSuggestion({
        ctx,
        suggestion,
        threadId: thread.id,
      });
    } catch {
      toast.error("Could not apply this inline suggestion.");
    } finally {
      setBusyKey(null);
    }
  };

  const handleInlineDismiss = async (suggestion: InlineSuggestion) => {
    setBusyKey(`inline:dismiss:${suggestion.id}`);
    try {
      await dismissInlineSuggestion({
        ctx,
        suggestion,
        threadId: thread.id,
      });
    } catch {
      toast.error("Could not dismiss this inline suggestion.");
    } finally {
      setBusyKey(null);
    }
  };

  const value: ThreadReadContextValue = {
    state: {
      busyKey,
      editingAlternativeReply,
      editingPrimaryReply,
      inlineSuggestions,
      isCompound,
      orderedSelected,
      read,
      readFingerprint,
      replyDraft,
      replyEditorOpen,
      replyEditorRevision,
      replyIndex,
      replyTarget,
      selectedIndices,
      thread,
      visibleAlternatives,
    },
    actions: {
      handleAlternativeClick,
      handleCancelReplyEditor,
      handleDismissRead,
      handleDraftChange: setReplyDraft,
      handleInlineAccept,
      handleInlineDismiss,
      handlePrimaryClick,
      handleSendReply,
      handleToggleAction: toggleAction,
    },
    meta: { ctx },
  };

  return (
    <ThreadReadContext.Provider value={value}>
      {children}
    </ThreadReadContext.Provider>
  );
}
