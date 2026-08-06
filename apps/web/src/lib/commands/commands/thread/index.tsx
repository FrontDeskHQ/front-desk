import { useLiveQuery } from "@live-state/sync/client";
import { getRouteApi } from "@tanstack/react-router";
import { Copy } from "lucide-react";
import { toast } from "sonner";

import { useOrganizationSwitcher } from "~/lib/hooks/query/use-organization-switcher";
import { query } from "~/lib/live-state";

import { useCommandContext } from "../..";
import { createAssignmentCommands } from "./assignment";
import { createLabelCommands } from "./labels";
import { createPriorityCommands } from "./priority";
import { createStatusCommands } from "./status";

// Memoize icon outside component for stable reference
const copyIcon = <Copy />;

export const ThreadCommands = ({ threadId }: { threadId: string }) => {
  const { activeOrganization } = useOrganizationSwitcher();
  const organizationId = activeOrganization?.id ?? "";
  const { user } = getRouteApi("/app").useRouteContext();

  const orgUsers = useLiveQuery(
    query.organizationUser
      .where({ enabled: true, organizationId: activeOrganization?.id })
      .include({ user: true })
  );

  const thread = useLiveQuery(
    query.thread.first({ id: threadId }).include({
      assignedUser: true,
    })
  );

  const labels = useLiveQuery(
    query.label.where({
      enabled: true,
      organizationId: activeOrganization?.id,
    })
  );

  const threadLabels = useLiveQuery(
    query.threadLabel
      .where({
        label: { enabled: true },
        threadId,
      })
      .include({ label: true })
  );

  useCommandContext(
    () => {
      const { commands: assignmentCommands, assignUserPage } =
        createAssignmentCommands({
          orgUsers: orgUsers ?? null,
          organizationId,
          thread,
          threadId,
          user,
        });
      const { commands: statusCommands, statusPage } = createStatusCommands({
        organizationId,
        thread,
        threadId,
        user,
      });
      const { commands: priorityCommands, priorityPage } =
        createPriorityCommands({
          organizationId,
          thread,
          threadId,
          user,
        });
      const { commands: labelCommands, labelsPage } = createLabelCommands({
        labels,
        threadId,
        threadLabels,
      });

      return {
        commands: [
          ...assignmentCommands,
          ...statusCommands,
          ...priorityCommands,
          ...labelCommands,
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
        footer: (
          <div className="text-xs bg-foreground-tertiary/15 px-2 py-1 rounded-sm">
            {thread?.name}
          </div>
        ),
        id: "thread",
        label: "Thread",
        pages: {
          "assign-user": assignUserPage,
          labels: labelsPage,
          priority: priorityPage,
          status: statusPage,
        },
      };
    },
    {
      active: Boolean(organizationId),
      deps: [
        threadId,
        organizationId,
        thread,
        user,
        orgUsers,
        labels,
        threadLabels,
      ],
    }
  );

  return null;
};
