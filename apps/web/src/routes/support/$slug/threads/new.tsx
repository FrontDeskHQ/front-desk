import {
  createFileRoute,
  Link,
  notFound,
  useRouter,
} from "@tanstack/react-router";
import { Avatar } from "@workspace/ui/components/avatar";
import { InputBox } from "@workspace/ui/components/blocks/tiptap";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbSeparator,
} from "@workspace/ui/components/breadcrumb";
import { Button } from "@workspace/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { Logo } from "@workspace/ui/components/logo";
import { Navbar } from "@workspace/ui/components/navbar";
import { useState } from "react";
import { ulid } from "ulid";
import { fetchClient } from "~/lib/live-state";
import { seo } from "~/utils/seo";

export const Route = createFileRoute("/support/$slug/threads/new")({
  component: RouteComponent,

  loader: async ({ params }) => {
    const { slug } = params;

    const organization = (
      await fetchClient.query.organization.where({ slug: slug }).get()
    )[0];

    if (!organization) {
      throw notFound();
    }

    return {
      organization,
    };
  },

  head: ({ loaderData }) => {
    const orgName = loaderData?.organization?.name ?? "Support";
    return {
      meta: [
        ...seo({
          title: `New Thread - ${orgName} - Support`,
          description: `Create a new support thread for ${orgName}`,
        }),
      ],
    };
  },
});

function RouteComponent() {
  const router = useRouter();
  const { organization } = Route.useLoaderData();
  const { portalSession } = Route.useRouteContext();

  const [threadTitle, setThreadTitle] = useState("");
  const [threadContent, setThreadContent] = useState<
    Parameters<
      NonNullable<React.ComponentProps<typeof InputBox>["onValueChange"]>
    >[0]
  >([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<{
    title?: string;
    content?: string;
    general?: string;
  }>({});

  const discordUrl = JSON.parse(organization.socials ?? "{}")?.discord;

  const validateForm = () => {
    const newErrors: typeof errors = {};

    if (!threadTitle.trim()) {
      newErrors.title = "Thread title is required";
    } else if (threadTitle.trim().length < 3) {
      newErrors.title = "Thread title must be at least 3 characters";
    }

    if (!threadContent.length || !threadContent[0]?.content) {
      newErrors.content = "Thread description is required";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validateForm()) {
      return;
    }

    const user = portalSession?.user;
    if (!user) {
      setErrors({ general: "You must be signed in to create a thread" });
      return;
    }

    setIsSubmitting(true);
    setErrors({});

    try {
      // Get or create author
      const author = await fetchClient.query.author
        .first({ userId: user.id })
        .get();

      let authorId = author?.id;

      if (!authorId) {
        authorId = ulid().toLowerCase();
        await fetchClient.mutate.author.insert({
          id: authorId,
          userId: user.id,
          metaId: null,
          name: user.name,
          organizationId: organization.id,
        });
      }

      // Create thread
      const threadId = ulid().toLowerCase();
      await fetchClient.mutate.thread.insert({
        id: threadId,
        name: threadTitle.trim(),
        organizationId: organization.id,
        authorId: authorId,
        status: 0, // Open status
        priority: 0, // Normal priority
        assignedUserId: null,
        createdAt: new Date(),
        deletedAt: null,
        discordChannelId: null,
      });

      // Create first message
      const messageId = ulid().toLowerCase();
      await fetchClient.mutate.message.insert({
        id: messageId,
        authorId: authorId,
        content: JSON.stringify(threadContent),
        threadId: threadId,
        createdAt: new Date(),
        origin: null,
        externalMessageId: null,
      });

      // Navigate to the new thread
      router.navigate({
        to: "/support/$slug/threads/$id",
        params: { slug: organization.slug, id: threadId },
      });
    } catch (error) {
      console.error("Failed to create thread:", error);
      setErrors({
        general: "Failed to create thread. Please try again.",
      });
      setIsSubmitting(false);
    }
  };

  if (!portalSession?.user) {
    return (
      <div className="flex flex-col size-full gap-4 sm:gap-8 min-h-screen">
        <Navbar>
          <Navbar.Group>
            <Logo>
              <Logo.Icon />
              <Logo.Text />
              <Logo.Separator />
              <Avatar
                src={organization.logoUrl}
                variant="org"
                fallback={organization.name}
                size="lg"
              />
              <Logo.Text>{organization.name}</Logo.Text>
            </Logo>
          </Navbar.Group>
          <Navbar.Group>
            {discordUrl && (
              <Button size="lg" externalLink asChild>
                <a href={discordUrl} target="_blank" rel="noreferrer">
                  Join Discord
                </a>
              </Button>
            )}
          </Navbar.Group>
        </Navbar>
        <div className="flex flex-col flex-1 px-4 pb-4 sm:pb-8 sm:px-8 items-center justify-center">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle>Sign in required</CardTitle>
              <CardDescription>
                You must be signed in to create a new thread.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild className="w-full">
                <Link
                  to="/support/$slug/threads"
                  params={{ slug: organization.slug }}
                >
                  Go back to threads
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col size-full gap-4 sm:gap-8 min-h-screen">
      <Navbar>
        <Navbar.Group>
          <Logo>
            <Logo.Icon />
            <Logo.Text />
            <Logo.Separator />
            <Avatar
              src={organization.logoUrl}
              variant="org"
              fallback={organization.name}
              size="lg"
            />
            <Logo.Text>{organization.name}</Logo.Text>
          </Logo>
        </Navbar.Group>
        <Navbar.Group>
          {discordUrl && (
            <Button size="lg" externalLink asChild>
              <a href={discordUrl} target="_blank" rel="noreferrer">
                Join Discord
              </a>
            </Button>
          )}
        </Navbar.Group>
      </Navbar>
      <div className="flex flex-col px-4 pb-4 sm:pb-8 sm:px-8 justify-center">
        <div className="flex justify-center w-full">
          <Card className="w-full flex flex-col max-w-5xl">
            <CardHeader>
              <CardTitle>
                <Breadcrumb>
                  <BreadcrumbList>
                    <BreadcrumbItem>
                      <BreadcrumbLink asChild>
                        <Link
                          to="/support/$slug/threads"
                          params={{ slug: organization.slug }}
                        >
                          Threads
                        </Link>
                      </BreadcrumbLink>
                    </BreadcrumbItem>
                    <BreadcrumbSeparator />
                    <BreadcrumbItem>
                      <BreadcrumbLink asChild className="text-white">
                        <Link
                          to="/support/$slug/threads/new"
                          params={{ slug: organization.slug }}
                        >
                          New Thread
                        </Link>
                      </BreadcrumbLink>
                    </BreadcrumbItem>
                  </BreadcrumbList>
                </Breadcrumb>
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-6 pt-6">
              <CardDescription>
                Create a new support thread to get help from the team
              </CardDescription>

              <div className="flex flex-col gap-2">
                <Label htmlFor="thread-title">Thread Title</Label>
                <Input
                  id="thread-title"
                  placeholder="Briefly describe your question or issue..."
                  value={threadTitle}
                  onChange={(e) => setThreadTitle(e.target.value)}
                  disabled={isSubmitting}
                  className="text-base"
                />
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="thread-content">
                  Description
                  <span className="text-destructive ml-1">*</span>
                </Label>
                <InputBox
                  className="min-h-64 w-full shadow-lg bg-[#1B1B1E]"
                  value={threadContent}
                  onValueChange={setThreadContent}
                  clearOnSubmit={false}
                />
              </div>

              <div className="flex gap-3 justify-end pt-4">
                <Button variant="outline" asChild disabled={isSubmitting}>
                  <Link
                    to="/support/$slug/threads"
                    params={{ slug: organization.slug }}
                  >
                    Cancel
                  </Link>
                </Button>
                <Button onClick={handleSubmit} disabled={isSubmitting}>
                  {isSubmitting ? "Creating..." : "Create Thread"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
