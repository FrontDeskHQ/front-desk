import { useLiveQuery } from "@live-state/sync/client";
import { createFileRoute, Link } from "@tanstack/react-router";
import { githubIntegrationSchema } from "@workspace/schemas/integration/github";
import {
  RichText,
  TruncatedText,
} from "@workspace/ui/components/blocks/tiptap";
import { Button } from "@workspace/ui/components/button";
import { Card, CardContent } from "@workspace/ui/components/card";
import { Separator } from "@workspace/ui/components/separator";
import { useAtomValue } from "jotai/react";
import { ArrowLeft } from "lucide-react";
import { ulid } from "ulid";
import { activeOrganizationAtom } from "~/lib/atoms";
import { fetchClient, mutate, query } from "~/lib/live-state";
import { seo } from "~/utils/seo";
import { integrationOptions } from "..";

export const Route = createFileRoute(
  "/app/_workspace/settings/organization/integration/github/",
)({
  component: RouteComponent,
  head: () => {
    return {
      meta: [
        ...seo({
          title: "GitHub Integration - FrontDesk",
          description: "Configure GitHub integration",
        }),
      ],
    };
  },
});

// biome-ignore lint/style/noNonNullAssertion: This is a constant and we know it will always be found
const integrationDetails = integrationOptions.find(
  (option) => option.id === "github",
)!;

const generateStateToken = (): string => {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
};

function RouteComponent() {
  const activeOrg = useAtomValue(activeOrganizationAtom);
  const integration = useLiveQuery(
    query.integration.first({ organizationId: activeOrg?.id, type: "github" }),
  );

  const parsedConfig: ReturnType<
    typeof githubIntegrationSchema.safeParse
  > | null = (() => {
    if (!integration?.configStr) return null;
    try {
      return githubIntegrationSchema.safeParse(
        JSON.parse(integration.configStr),
      );
    } catch {
      return {
        success: false,
        error: new Error("Invalid JSON in integration.configStr"),
      } as ReturnType<typeof githubIntegrationSchema.safeParse>;
    }
  })();

  const handleEnableGitHub = async () => {
    const GITHUB_CLIENT_ID = import.meta.env.VITE_GITHUB_CLIENT_ID;

    if (!GITHUB_CLIENT_ID) {
      console.error("[GitHub] Client ID is not configured");
      return;
    }

    if (!activeOrg?.id) {
      console.error("[GitHub] No active organization selected");
      return;
    }

    const csrfToken = generateStateToken();

    if (integration) {
      await fetchClient.mutate.integration.update(integration.id, {
        enabled: false,
        updatedAt: new Date(),
        configStr: JSON.stringify({
          ...(parsedConfig?.data ?? {}),
          csrfToken,
        }),
      });
    } else if (activeOrg?.id) {
      await fetchClient.mutate.integration.insert({
        id: ulid().toLowerCase(),
        organizationId: activeOrg?.id,
        type: "github",
        enabled: false,
        updatedAt: new Date(),
        createdAt: new Date(),
        configStr: JSON.stringify({
          ...(parsedConfig?.data ?? {}),
          csrfToken,
        }),
      });
    }

    // Use the GitHub server URL (ngrok URL in dev) for the redirect URI
    // This must match exactly what's configured in GitHub OAuth app settings
    const githubServerUrl =
      import.meta.env.VITE_GITHUB_SERVER_URL || "http://localhost:3334";
    const redirectUri = `${githubServerUrl}/api/github/oauth/callback`;

    const queryParams = new URLSearchParams({
      client_id: GITHUB_CLIENT_ID,
      scope: "repo",
      redirect_uri: redirectUri,
      state: `${activeOrg?.id}_${csrfToken}`,
    });

    // GitHub OAuth authorization URL
    const githubOAuthUrl = `https://github.com/login/oauth/authorize?${queryParams.toString()}`;

    window.location.href = githubOAuthUrl;
  };

  if (parsedConfig && !parsedConfig.success) {
    console.error(
      "Invalid GitHub integration configuration",
      parsedConfig.error,
    );

    return (
      <p className="text-center">
        Your GitHub integration is not configured correctly.{" "}
        <a href="mailto:support@tryfrontdesk.app" className="underline">
          Please contact support.
        </a>
      </p>
    );
  }

  return (
    <>
      <Button variant="ghost" asChild className="absolute top-2 left-1">
        <Link to="/app/settings/organization/integration">
          <ArrowLeft />
          Integrations
        </Link>
      </Button>
      <div className="flex flex-col gap-4 pt-12">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {integrationDetails.icon}
            <div>
              <h1 className="text-base">{integrationDetails.label}</h1>
              <h2 className="text-muted-foreground">
                {integrationDetails.description}
              </h2>
            </div>
          </div>
          {!integration?.enabled && (
            <div className="flex gap-5 items-center">
              <div>
                <h3 className="text-muted-foreground">Built by</h3>
                <p>FrontDesk</p>
              </div>
              <Button onClick={handleEnableGitHub}>Enable</Button>
            </div>
          )}
        </div>
        <Card className="bg-muted/30">
          <CardContent>
            {!integration?.enabled ? (
              <TruncatedText>
                <RichText content={integrationDetails.fullDescription} />
              </TruncatedText>
            ) : (
              <>
                <div className="flex gap-8 items-center justify-between">
                  <div className="flex flex-col">
                    <div>Linked Repository</div>
                    <div className="text-muted-foreground">
                      {parsedConfig?.data?.repositoryOwner &&
                      parsedConfig?.data?.repositoryName
                        ? `${parsedConfig.data.repositoryOwner}/${parsedConfig.data.repositoryName}`
                        : "No repository selected"}
                    </div>
                  </div>
                </div>

                <Separator />
                <div className="flex gap-5 items-center">
                  Disable integration
                  <Button
                    variant="ghost"
                    className="ml-auto text-red-700 dark:hover:text-red-500"
                    onClick={() => {
                      mutate.integration.update(integration?.id, {
                        enabled: false,
                        updatedAt: new Date(),
                      });
                    }}
                  >
                    Disable
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
