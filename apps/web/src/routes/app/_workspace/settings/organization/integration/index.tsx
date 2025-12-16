import { useLiveQuery } from "@live-state/sync/client";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useOrganizationSwitcher } from "~/lib/hooks/query/use-organization-switcher";
import { query } from "~/lib/live-state";
import { seo } from "~/utils/seo";

export const Route = createFileRoute(
  "/app/_workspace/settings/organization/integration/",
)({
  component: RouteComponent,
  head: () => {
    return {
      meta: [
        ...seo({
          title: "Integrations - FrontDesk",
          description: "Manage your integrations",
        }),
      ],
    };
  },
});

export const integrationOptions: {
  label: string;
  id: string;
  icon: React.ReactNode;
  description: string;
  fullDescription: string;
}[] = [
  {
    label: "Discord",
    id: "discord",
    description: "Sync forum channels and threads from your Discord server",
    icon: (
      <div className="flex items-center justify-center rounded-md bg-[#5865F2] size-9 overflow-clip">
        <svg
          viewBox="0 0 256 199"
          preserveAspectRatio="xMidYMid"
          className="w-6"
        >
          <title>Discord logo</title>
          <path
            d="M216.856 16.597A208.502 208.502 0 0 0 164.042 0c-2.275 4.113-4.933 9.645-6.766 14.046-19.692-2.961-39.203-2.961-58.533 0-1.832-4.4-4.55-9.933-6.846-14.046a207.809 207.809 0 0 0-52.855 16.638C5.618 67.147-3.443 116.4 1.087 164.956c22.169 16.555 43.653 26.612 64.775 33.193A161.094 161.094 0 0 0 79.735 175.3a136.413 136.413 0 0 1-21.846-10.632 108.636 108.636 0 0 0 5.356-4.237c42.122 19.702 87.89 19.702 129.51 0a131.66 131.66 0 0 0 5.355 4.237 136.07 136.07 0 0 1-21.886 10.653c4.006 8.02 8.638 15.67 13.873 22.848 21.142-6.58 42.646-16.637 64.815-33.213 5.316-56.288-9.08-105.09-38.056-148.36ZM85.474 135.095c-12.645 0-23.015-11.805-23.015-26.18s10.149-26.2 23.015-26.2c12.867 0 23.236 11.804 23.015 26.2.02 14.375-10.148 26.18-23.015 26.18Zm85.051 0c-12.645 0-23.014-11.805-23.014-26.18s10.148-26.2 23.014-26.2c12.867 0 23.236 11.804 23.015 26.2 0 14.375-10.148 26.18-23.015 26.18Z"
            fill="white"
          />
        </svg>
      </div>
    ),
    fullDescription: `
#### Overview
By using the Discord integration in FrontDesk, you enable your users to reach out for help directly from your Discord server, while your team can respond and manage those conversations from a single shared inbox. This keeps all support channels unified, organized, and consistent—no matter where your customers prefer to reach you.

#### How it works
To get started, simply add the FrontDesk Discord bot to your server and select which channels you want to use for customer support. When users create a support thread in those channels, it will automatically sync with FrontDesk in real time. Messages sent on Discord will instantly appear in FrontDesk, and replies from your support team in FrontDesk will post back to the corresponding Discord thread. Every synced thread includes full FrontDesk functionality—such as status updates, priority settings, assignee management, and more—so your team can handle Discord conversations with the same efficiency and visibility as any other support channel.
`,
  },
  {
    label: "Slack",
    id: "slack",
    description: "Sync channels and threads from your Slack workspace",
    icon: (
      <div className="flex items-center justify-center rounded-md bg-[#4A154B] size-9 overflow-clip">
        <svg viewBox="0 0 24 24" className="w-5 h-5" fill="white">
          <title>Slack logo</title>
          <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.52v-6.315zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.522 2.521 2.527 2.527 0 0 1-2.522-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.522 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.522 2.521A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.522-2.522 2.527 2.527 0 0 1 2.522-2.522h6.312A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.521h-6.313z" />
        </svg>
      </div>
    ),
    fullDescription: `
#### Overview
By using the Slack integration in FrontDesk, you enable your users to reach out for help directly from your Slack workspace, while your team can respond and manage those conversations from a single shared inbox. This keeps all support channels unified, organized, and consistent—no matter where your customers prefer to reach you.

#### How it works
To get started, simply add the FrontDesk Slack app to your workspace and select which channels you want to use for customer support. When users create a support thread in those channels, it will automatically sync with FrontDesk in real time. Messages sent on Slack will instantly appear in FrontDesk, and replies from your support team in FrontDesk will post back to the corresponding Slack thread. Every synced thread includes full FrontDesk functionality—such as status updates, priority settings, assignee management, and more—so your team can handle Slack conversations with the same efficiency and visibility as any other support channel.
`,
  },
  // Uncomment and complete these when their integrations are ready
  // {
  //   label: "Email",
  //   id: "email",
  //   description: "Sync emails from your support inbox",
  //   icon: (
  //     <div className="flex items-center justify-center rounded-md bg-blue-500 size-9 overflow-clip">
  //       <Mail className="text-white w-5 h-5" />
  //     </div>
  //   ),
  //   fullDescription: "Connect your support email to sync incoming emails.",
  // },
];

function RouteComponent() {
  const { activeOrganization } = useOrganizationSwitcher();

  const integrations = useLiveQuery(
    query.integration.where({
      organizationId: activeOrganization?.id,
    }),
  );

  const activeIntegrations = integrationOptions.filter((option) =>
    integrations?.some((i) => i.type === option.id && i.enabled),
  );

  const availableIntegrations = integrationOptions.filter(
    (option) => !activeIntegrations.includes(option),
  );

  const { user } = Route.useRouteContext();
  const isUserOwner =
    useLiveQuery(
      query.organizationUser.first({
        organizationId: activeOrganization?.id,
        userId: user.id,
      }),
    )?.role === "owner";

  const renderIntegrationGroup = (
    label: string,
    options: typeof integrationOptions,
  ) => {
    if (options.length === 0) return null;
    return (
      <div className="p-4 flex flex-col gap-4 w-full" key={label}>
        <h2 className="text-base">{label}</h2>
        <div className="grid grid-cols-3 gap-4">
          {options.map((option) => {
            const content = (
              <>
                <div className="flex items-center gap-2 justify-between">
                  <div className="flex items-center gap-2">
                    {option.icon}
                    {option.label}
                  </div>
                </div>
                <div className="w-full text-muted-foreground">
                  {option.description}
                </div>
              </>
            );

            if (isUserOwner) {
              return (
                <Link
                  to={
                    `/app/settings/organization/integration/${option.id}` as string
                  }
                  className="flex flex-col rounded-md border bg-muted/30 h-36 p-4 gap-2 hover:bg-muted/50 transition-colors cursor-pointer relative"
                  key={option.id}
                >
                  {content}
                </Link>
              );
            }

            return (
              <div
                className="flex flex-col rounded-md border bg-muted/30 h-36 p-4 gap-2 transition-colors relative"
                key={option.id}
              >
                {content}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <>
      {renderIntegrationGroup("Active integrations", activeIntegrations)}
      {renderIntegrationGroup("Available integrations", availableIntegrations)}
    </>
  );
}
