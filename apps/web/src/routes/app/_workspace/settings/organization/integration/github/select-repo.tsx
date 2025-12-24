import { useLiveQuery } from "@live-state/sync/client";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Button } from "@workspace/ui/components/button";
import { Card, CardContent } from "@workspace/ui/components/card";
import { useAtomValue } from "jotai/react";
import { ArrowLeft } from "lucide-react";
import { useCallback } from "react";
import { activeOrganizationAtom } from "~/lib/atoms";
import { mutate, query } from "~/lib/live-state";
import { seo } from "~/utils/seo";

export const Route = createFileRoute(
  "/app/_workspace/settings/organization/integration/github/select-repo",
)({
  component: RouteComponent,
  head: () => {
    return {
      meta: [
        ...seo({
          title: "Select Repository - FrontDesk",
          description: "Select a GitHub repository",
        }),
      ],
    };
  },
});

function RouteComponent() {
  const activeOrg = useAtomValue(activeOrganizationAtom);
  const navigate = useNavigate();
  const integration = useLiveQuery(
    query.integration.first({ organizationId: activeOrg?.id, type: "github" }),
  );

  const config = integration?.configStr
    ? JSON.parse(integration.configStr)
    : null;

  const pendingRepos = config?.pendingRepos || [];

  const handleSelectRepo = useCallback(
    async (owner: string, name: string) => {
      if (!integration) return;

      const currentConfig = integration.configStr
        ? JSON.parse(integration.configStr)
        : {};

      // Update integration with selected repository and clear temporary data
      const {
        accessToken: _accessToken,
        pendingRepos: _pendingRepos,
        ...restConfig
      } = currentConfig;

      await mutate.integration.update(integration.id, {
        enabled: true,
        updatedAt: new Date(),
        configStr: JSON.stringify({
          ...restConfig,
          repositoryOwner: owner,
          repositoryName: name,
        }),
      });

      navigate({ to: "/app/settings/organization/integration/github" });
    },
    [integration, navigate],
  );

  return (
    <>
      <Button variant="ghost" asChild className="absolute top-2 left-1">
        <a href="/app/settings/organization/integration/github">
          <ArrowLeft />
          Back
        </a>
      </Button>
      <div className="flex flex-col gap-4 pt-12">
        <h1 className="text-2xl font-bold">Select a Repository</h1>
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col gap-2">
              {pendingRepos.length === 0 ? (
                <p className="text-muted-foreground">
                  No repositories found. Make sure you have access to at least
                  one repository.
                </p>
              ) : (
                pendingRepos.map(
                  (repo: { fullName: string; owner: string; name: string }) => (
                    <Button
                      key={repo.fullName}
                      variant="outline"
                      className="w-full justify-start"
                      onClick={() => handleSelectRepo(repo.owner, repo.name)}
                    >
                      {repo.fullName}
                    </Button>
                  ),
                )
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
