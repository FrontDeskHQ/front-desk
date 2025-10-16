import { createFileRoute, Link } from "@tanstack/react-router";
import {
  RichText,
  TruncatedText,
} from "@workspace/ui/components/blocks/tiptap";
import { Button } from "@workspace/ui/components/button";
import { Card, CardContent } from "@workspace/ui/components/card";
import { ArrowLeft } from "lucide-react";
import { integrationOptions } from ".";

export const Route = createFileRoute(
  "/app/_workspace/settings/organization/integration/discord",
)({
  component: RouteComponent,
});


function RouteComponent() {
  const integration = integrationOptions
    .flatMap((option) => option.options)
    .find((option) => option.id === "discord");

  if (!integration) {
    return <div>Integration not found</div>;
  }


function RouteComponent() {
  return (
    <>
      <Button variant="ghost" asChild className="absolute top-2 left-2">
        <Link to="/app/settings/organization/integration">
          <ArrowLeft />
          Integrations
        </Link>
      </Button>
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          {integration.icon}
          <div>
            <h1 className="text-base">{integration.label}</h1>
            <h2 className="text-muted-foreground">{integration.description}</h2>
          </div>
        </div>
        <Card className="bg-muted/30">
          <CardContent>
            <div className="flex gap-5 items-center">
              <div>
                <h3 className="text-muted-foreground">Built by</h3>
                <p>FrontDesk</p>
              </div>
              <Button className="ml-auto">Enable</Button>
            </div>
            <TruncatedText>
              <RichText content={integration.fullDescription} />
            </TruncatedText>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
