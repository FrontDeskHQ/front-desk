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

  const userIds = useMemo(() => {
    return (orgUsers?.map((orgUser) => orgUser.userId) ?? []).join(",");
  }, [orgUsers]);

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

  useCommandContext(
    {
      id: "thread",
      label: "Thread",
      commands: [
        ...assignmentCommands,
        ...statusCommands,
        ...priorityCommands,
        {
          id: "copy-link",
          label: "Copy Link",
          icon: <Copy />,
          onSelect: () => {
            navigator.clipboard.writeText(window.location.href);
            toast.success("Link copied to clipboard");
          },
        },
      ],
      pages: {
        "assign-user": assignUserPage,
        status: statusPage,
        priority: priorityPage,
      },
      footer: (
        <div className="text-xs bg-foreground-tertiary/15 px-2 py-1 rounded-sm">
          {thread?.name}
        </div>
      ),
    },
    true,
    [
      threadId,
      userIds,
      assignmentCommands,
      assignUserPage,
      statusCommands,
      statusPage,
      priorityCommands,
      priorityPage,
    ],
  );

  return null;
};
