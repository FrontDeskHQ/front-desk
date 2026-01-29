import { useLiveQuery } from "@live-state/sync/client";
import { getRouteApi } from "@tanstack/react-router";
import { Copy } from "lucide-react";
import { useMemo } from "react";
import { toast } from "sonner";
import { useOrganizationSwitcher } from "~/lib/hooks/query/use-organization-switcher";
import { query } from "~/lib/live-state";
import { useCommandContext } from "../..";
import { createAssignmentCommands } from "./assignment";
import { createPriorityCommands } from "./priority";
import { createStatusCommands } from "./status";

// Memoize icon outside component for stable reference
const copyIcon = <Copy />;

export const ThreadCommands = ({ threadId }: { threadId: string }) => {
  const { activeOrganization } = useOrganizationSwitcher();
  const { user } = getRouteApi("/app").useRouteContext();

  const orgUsers = useLiveQuery(
    query.organizationUser
      .where({ organizationId: activeOrganization?.id, enabled: true })
      .include({ user: true }),
  );

  const thread = useLiveQuery(
    query.thread.first({ id: threadId }).include({
      assignedUser: true,
    }),
  );

  const { commands: assignmentCommands, assignUserPage } = useMemo(
    () =>
      createAssignmentCommands({
        threadId,
        thread,
        user,
        orgUsers: orgUsers ?? null,
      }),
    [threadId, thread, user, orgUsers],
  );

  const { commands: statusCommands, statusPage } = useMemo(
    () =>
      createStatusCommands({
        threadId,
        thread,
        user,
      }),
    [threadId, thread, user],
  );

  const { commands: priorityCommands, priorityPage } = useMemo(
    () =>
      createPriorityCommands({
        threadId,
        thread,
        user,
      }),
    [threadId, thread, user],
  );

  // Memoize the copy-link command to prevent recreating it on every render
  const copyLinkCommand = useMemo(
    () => ({
      id: "copy-link",
      label: "Copy Link",
      icon: copyIcon,
      onSelect: () => {
        navigator.clipboard.writeText(window.location.href);
        toast.success("Link copied to clipboard");
      },
    }),
    [],
  );

  // Memoize footer JSX to prevent recreating it on every render
  const footer = useMemo(
    () => (
      <div className="text-xs bg-foreground-tertiary/15 px-2 py-1 rounded-sm">
        {thread?.name}
      </div>
    ),
    [thread?.name],
  );

  // Memoize the entire context object to prevent unnecessary re-registrations
  const threadContext = useMemo(
    () => ({
      id: "thread",
      label: "Thread",
      commands: [
        ...assignmentCommands,
        ...statusCommands,
        ...priorityCommands,
        copyLinkCommand,
      ],
      pages: {
        "assign-user": assignUserPage,
        status: statusPage,
        priority: priorityPage,
      },
      footer,
    }),
    [
      assignmentCommands,
      statusCommands,
      priorityCommands,
      copyLinkCommand,
      assignUserPage,
      statusPage,
      priorityPage,
      footer,
    ],
  );

  // Pass stable primitive dependencies - context.id is already included internally
  // Only pass additional primitives that should trigger re-registration
  useCommandContext(threadContext, true, [threadId]);

  return null;
};
