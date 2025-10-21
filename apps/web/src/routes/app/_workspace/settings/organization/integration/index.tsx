import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute(
  "/app/_workspace/settings/organization/integration/",
)({
  component: RouteComponent,
});

export const integrationOptions: {
  label: string;
  options: {
    label: string;
    id: string;
    icon: React.ReactNode;
    description: string;
    fullDescription: string;
  }[];
}[] = [
  {
    label: "Support channels",
    options: [
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
    ],
  },
];

function RouteComponent() {
  return (
    <>
      {integrationOptions.map((option) => (
        <div className="p-4 flex flex-col gap-4 w-full" key={option.label}>
          <h2 className="text-base">{option.label}</h2>
          <div className="grid grid-cols-3 gap-4">
            {option.options.map((option) => (
              <Link
                to={
                  `/app/settings/organization/integration/${option.id}` as string
                }
                className="flex flex-col rounded-md border bg-muted/30 h-36 p-4 gap-2 hover:bg-muted/50 transition-colors cursor-pointer"
                key={option.id}
              >
                <div className="flex items-center gap-2">
                  {option.icon}
                  {option.label}
                </div>
                <div className="w-full text-muted-foreground">
                  {option.description}
                </div>
              </Link>
            ))}
          </div>
        </div>
      ))}
    </>
  );
}
