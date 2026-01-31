import { useLiveQuery } from "@live-state/sync/client";
import { useFlag } from "@reflag/react-sdk";
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
import { usePostHog } from "posthog-js/react";
import { ulid } from "ulid";
import { activeOrganizationAtom } from "~/lib/atoms";
import { fetchClient, mutate, query } from "~/lib/live-state";
import { seo } from "~/utils/seo";
import { integrationOptions } from "..";

export const Route = createFileRoute(
  "/app/_workspace/settings/organization/integration/github/"
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
  (option) => option.id === "github"
)!;

const generateStateToken = (): string => {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => byte.toString(16).padStart(2, "0")).join(
    ""
  );
};

function RouteComponent() {
  const posthog = usePostHog();
  const { isEnabled: isGithubIntegrationEnabled, isLoading: isFlagLoading } =
    useFlag("github-integration");
  const activeOrg = useAtomValue(activeOrganizationAtom);
  const integration = useLiveQuery(
    query.integration.first({ organizationId: activeOrg?.id, type: "github" })
  );
  if (!activeOrg) {
    return null;
  }

  const parsedConfig: ReturnType<
    typeof githubIntegrationSchema.safeParse
  > | null = (() => {
    if (!integration?.configStr) return null;
    try {
      return githubIntegrationSchema.safeParse(
        JSON.parse(integration.configStr)
      );
    } catch {
      return {
        success: false,
        error: new Error("Invalid JSON in integration.configStr"),
      } as ReturnType<typeof githubIntegrationSchema.safeParse>;
    }
  })();

  const handleEnableGitHub = async () => {
    const GITHUB_APP_SLUG = import.meta.env.VITE_GITHUB_APP_SLUG;

    if (!GITHUB_APP_SLUG) {
      console.error("[GitHub] App slug is not configured");
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

    // Redirect to GitHub App installation page
    // The state parameter will be passed back in the callback
    const state = `${activeOrg?.id}_${csrfToken}`;
    const githubAppInstallUrl = `https://github.com/apps/${GITHUB_APP_SLUG}/installations/new?state=${encodeURIComponent(
      state
    )}`;

    posthog?.capture("integration_enable", {
      integration_type: "github",
    });

    // Wait briefly to ensure analytics event is transmitted before navigation
    await new Promise((resolve) => setTimeout(resolve, 300));

    window.location.href = githubAppInstallUrl;
  };

  if (parsedConfig && !parsedConfig.success) {
    console.error(
      "Invalid GitHub integration configuration",
      parsedConfig.error
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
      <Button
        variant="ghost"
        render={<Link to="/app/settings/organization/integration" />}
        className="absolute top-2 left-1"
      >
        <ArrowLeft />
        Integrations
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
                <div className="flex flex-col gap-2">
                  <div>Connected Repositories</div>
                  <div className="text-muted-foreground">
                    {parsedConfig?.data?.repos &&
                    parsedConfig.data.repos.length > 0 ? (
                      <ul className="list-disc list-inside space-y-1">
                        {parsedConfig.data.repos.map((repo) => (
                          <li key={repo.fullName}>{repo.fullName}</li>
                        ))}
                      </ul>
                    ) : (
                      "No repositories connected"
                    )}
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
