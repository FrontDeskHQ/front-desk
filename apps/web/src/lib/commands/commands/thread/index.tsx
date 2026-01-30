import { useLiveQuery } from "@live-state/sync/client";
import { getRouteApi } from "@tanstack/react-router";
import { Copy } from "lucide-react";
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

  useCommandContext(
    () => {
      const { commands: assignmentCommands, assignUserPage } =
        createAssignmentCommands({
          threadId,
          thread,
          user,
          orgUsers: orgUsers ?? null,
        });
      const { commands: statusCommands, statusPage } = createStatusCommands({
        threadId,
        thread,
        user,
      });
      const { commands: priorityCommands, priorityPage } =
        createPriorityCommands({
          threadId,
          thread,
          user,
        });

      return {
        id: "thread",
        label: "Thread",
        commands: [
          ...assignmentCommands,
          ...statusCommands,
          ...priorityCommands,
          {
            id: "copy-link",
            label: "Copy Link",
            icon: copyIcon,
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
      };
    },
    {
      active: true,
      deps: [threadId, thread, user, orgUsers],
    },
  );

  return null;
};
