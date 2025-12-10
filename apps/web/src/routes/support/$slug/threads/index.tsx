import { useFlag } from "@reflag/react-sdk";
import {
  createFileRoute,
  Link,
  notFound,
  useRouter,
} from "@tanstack/react-router";
import { Avatar } from "@workspace/ui/components/avatar";
import { Button, buttonVariants } from "@workspace/ui/components/button";
import { ButtonGroup } from "@workspace/ui/components/button-group";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@workspace/ui/components/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu";
import {
  PriorityIndicator,
  StatusIndicator,
} from "@workspace/ui/components/indicator";
import { Logo } from "@workspace/ui/components/logo";
import { Navbar } from "@workspace/ui/components/navbar";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
} from "@workspace/ui/components/pagination";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@workspace/ui/components/tooltip";
import { getFirstTextContent, safeParseJSON } from "@workspace/ui/lib/tiptap";
import { formatRelativeTime } from "@workspace/ui/lib/utils";
import {
  ArrowDownWideNarrow,
  ArrowUpNarrowWide,
  ChevronDown,
  ChevronLeftIcon,
  ChevronRightIcon,
  ExternalLink,
  MessageSquarePlus,
} from "lucide-react";
import z from "zod";
import { fetchClient } from "~/lib/live-state";
import { portalAuthClient } from "~/lib/portal-auth-client";
import { getTenantBaseApiUrl } from "~/lib/urls";
import { seo } from "~/utils/seo";
import type { WindowWithCachedPortalAuthUser } from "../route";

type ThreadsSearchOrderOptions = "createdAt" | "updatedAt";

export const Route = createFileRoute("/support/$slug/threads/")({
  component: RouteComponent,

  validateSearch: z.object({
    page: z.coerce.number().optional(),
    order: z.enum(["createdAt", "updatedAt"]).optional(),
    dir: z.enum(["asc", "desc"]).optional(),
  }),

  loader: async ({ params }) => {
    const { slug } = params;
    // TODO: Replace where by first when new version of live-state is out
    const organization = (
      await fetchClient.query.organization.where({ slug: slug }).get()
    )[0];

    if (!organization) {
      throw notFound();
    }

    const threads = await fetchClient.query.thread
      .where({
        organizationId: organization.id,
        deletedAt: { $eq: null },
      })
      .include({ messages: { author: true }, author: true, assignedUser: true })
      .get();

    return {
      organization: organization as typeof organization,
      threads: threads as typeof threads,
    };
  },

  head: ({ loaderData }) => {
    const orgName = loaderData?.organization?.name ?? "Support";
    return {
      meta: [
        ...seo({
          title: `${orgName} - Support`,
          description: `Support threads for ${orgName}`,
        }),
      ],
    };
  },
});

const THREADS_PER_PAGE = 10;

function RouteComponent() {
  const { organization, threads } = Route.useLoaderData();
  const { portalSession } = Route.useRouteContext();
  const navigate = Route.useNavigate();
  const searchParams = Route.useSearch();

  const { isEnabled: isPortalAuthEnabled } = useFlag("portal-auth");
  console.log("Portal Auth Enabled:", isPortalAuthEnabled);

  const router = useRouter();

  // Apply defaults in the component, not in validateSearch
  const page = searchParams.page ?? 1;
  const order = searchParams.order ?? "createdAt";
  const dir = searchParams.dir ?? "desc";

  const orderByOptions: { label: string; value: ThreadsSearchOrderOptions }[] =
    [
      { label: "Created", value: "createdAt" },
      { label: "Last message", value: "updatedAt" },
    ];

  const handleSortChange = (value: ThreadsSearchOrderOptions) => {
    navigate({
      to: ".",
      search: (prev) => ({ ...prev, order: value }),
    });
  };

  const orderedThreads = [...(threads ?? [])].sort((a, b) => {
    const getTimestamp = (
      t: unknown,
      key: ThreadsSearchOrderOptions
    ): number => {
      // Narrow the unknown to the expected shape for safe property access
      const obj = t as { updatedAt?: string | Date; createdAt?: string | Date };

      if (key === "updatedAt") {
        return obj.updatedAt
          ? new Date(obj.updatedAt).getTime()
          : obj.createdAt
          ? new Date(obj.createdAt).getTime()
          : 0;
      }

      return obj.createdAt ? new Date(obj.createdAt).getTime() : 0;
    };

    const aTs = getTimestamp(a, order);
    const bTs = getTimestamp(b, order);

    // dir: 'asc' => oldest -> newest (a - b). 'desc' => newest -> oldest (b - a)
    if (dir === "asc") {
      return aTs - bTs;
    }

    return bTs - aTs;
  });

  const numPages = orderedThreads
    ? Math.ceil(orderedThreads?.length / THREADS_PER_PAGE)
    : 1;

  const currentPage = page ?? 1;

  const startIdx = THREADS_PER_PAGE * (currentPage - 1);
  const endIdx = THREADS_PER_PAGE * currentPage;

  const threadsInPage = orderedThreads?.slice(startIdx, endIdx);

  // Generate page numbers based on current position
  const generatePageNumbers = () => {
    const pages: (number | "ellipsis")[] = [];

    if (numPages <= 5) {
      // Show all pages if total pages <= 5
      for (let i = 1; i <= numPages; i++) {
        pages.push(i);
      }
    } else if (currentPage <= 3) {
      // At the beginning: 1, 2, 3, ..., lastPageIdx
      pages.push(1, 2, 3, "ellipsis", numPages);
    } else if (currentPage >= numPages - 2) {
      // At the end: 1, ..., lastPageIdx - 2, lastPageIdx - 1, lastPageIdx
      pages.push(1, "ellipsis", numPages - 2, numPages - 1, numPages);
    } else {
      // In the middle: 1, ..., currentPageIdx, ..., lastPageIdx
      pages.push(1, "ellipsis", currentPage, "ellipsis", numPages);
    }

    return pages;
  };

  const pageNumbers = generatePageNumbers();

  if (!organization) {
    return null;
  }

  const discordUrl = JSON.parse(organization.socials ?? "{}")?.discord;
  
  return (
    <div className="w-full">
      <Navbar>
        <Navbar.Group>
          <Logo>
            <Logo.Icon />
            <Logo.Text />
          </Logo>
        </Navbar.Group>
        {isPortalAuthEnabled && (
          <Navbar.Group>
            {portalSession?.user ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  portalAuthClient.signOut({
                    fetchOptions: {
                      baseURL: `${getTenantBaseApiUrl({
                        slug: organization.slug,
                      })}/api/portal-auth`,
                      onSuccess: () => {
                        (
                          window as WindowWithCachedPortalAuthUser
                        ).cachedPortalAuthUser = null;
                        router.invalidate();
                      },
                    },
                  })
                }
              >
                Sign out
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  portalAuthClient.signIn.social({
                    provider: "google",
                    additionalData: { tenantSlug: organization.slug },
                    callbackURL: window.location.origin,
                  })
                }
              >
                Sign in with Google
              </Button>
            )}
          </Navbar.Group>
        )}
      </Navbar>
      <div className="flex flex-col gap-8 mx-auto py-8 px-4 sm:px-6 lg:px-8 max-w-5xl">
        <div className="flex items-center gap-4">
          <div className="flex-shrink-0">
            <Avatar
              variant="org"
              size="xxl"
              src={organization?.logoUrl}
              fallback={organization?.name}
            />
          </div>
          <div className="flex items-center justify-between w-full gap-4">
            <h1 className="font-bold text-2xl sm:text-3xl truncate">
              {organization?.name}
            </h1>
            <ButtonGroup>
              {portalSession?.user ? (
                <Button asChild>
                  <Link
                    to="/support/$slug/threads/new"
                    params={{ slug: organization?.slug }}
                  >
                    <MessageSquarePlus />
                    Create Thread
                  </Link>
                </Button>
              ) : (
                <Dialog>
                  <DialogTrigger asChild>
                    <Button>
                      <MessageSquarePlus />
                      Create Thread
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Sign in required</DialogTitle>
                      <DialogDescription>
                        You need to sign in to create a new support thread.
                      </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                      <Button
                        onClick={() =>
                          portalAuthClient.signIn.social({
                            provider: "google",
                            additionalData: { tenantSlug: organization.slug },
                            callbackURL: window.location.origin,
                          })
                        }
                      >
                        Sign in with Google
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              )}
              {discordUrl && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button aria-label="More Options">
                      <ChevronDown />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-52">
                    <DropdownMenuGroup>
                      <DropdownMenuItem asChild>
                        <a
                          href={discordUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="cursor-pointer"
                        >
                          <svg
                            role="img"
                            viewBox="0 0 24 24"
                            xmlns="http://www.w3.org/2000/svg"
                            className="size-4 fill-current"
                          >
                            <title>Discord</title>
                            <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515a.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0a12.64 12.64 0 0 0-.617-1.25a.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057a19.9 19.9 0 0 0 5.993 3.03a.078.078 0 0 0 .084-.028a14.09 14.09 0 0 0 1.226-1.994a.076.076 0 0 0-.041-.106a13.107 13.107 0 0 1-1.872-.892a.077.077 0 0 1-.008-.128a10.2 10.2 0 0 0 .372-.292a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127a12.299 12.299 0 0 1-1.873.892a.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028a19.839 19.839 0 0 0 6.002-3.03a.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.956-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.955-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.946 2.418-2.157 2.418z" />
                          </svg>
                          Create on Discord
                          <ExternalLink className="ml-auto" />
                        </a>
                      </DropdownMenuItem>
                    </DropdownMenuGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </ButtonGroup>
          </div>
        </div>
        <Card className="bg-muted/30">
          <CardHeader>
            <CardTitle className="gap-4">Threads</CardTitle>
            <CardAction side="right">
              <Select
                value={order}
                onValueChange={(value) =>
                  handleSortChange(value as ThreadsSearchOrderOptions)
                }
                items={orderByOptions}
              >
                <SelectTrigger className="w-32" data-size="sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {orderByOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        navigate({
                          to: ".",
                          search: (prev) => ({
                            ...prev,
                            dir: dir === "asc" ? "desc" : "asc",
                          }),
                        })
                      }
                      className="size-8"
                    >
                      {dir === "asc" ? (
                        <ArrowDownWideNarrow />
                      ) : (
                        <ArrowUpNarrowWide />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Change order direction</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </CardAction>
          </CardHeader>
          <CardContent className="overflow-y-auto gap-0 items-center">
            {threadsInPage?.map((thread) => (
              <Link
                key={thread.id}
                to={"/support/$slug/threads/$id"}
                params={{ slug: organization.slug, id: thread.id }}
                className="w-full max-w-5xl flex flex-col p-3 gap-2 hover:bg-muted"
                resetScroll={false}
              >
                <div className="flex justify-between">
                  <div className="flex items-center gap-2">
                    <Avatar
                      variant="user"
                      size="md"
                      fallback={thread?.author?.name}
                    />
                    <div>{thread?.name}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <PriorityIndicator
                      priority={(thread as any)?.priority ?? 0}
                    />
                    <StatusIndicator status={(thread as any)?.status ?? 0} />
                  </div>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground min-w-0 flex-1 text-nowrap font-medium truncate max-w-2xl">
                    {
                      (thread as any)?.messages?.[
                        (thread as any)?.messages?.length - 1
                      ]?.author?.name
                    }
                    :&nbsp;
                    <span className="max-w-full">
                      {getFirstTextContent(
                        safeParseJSON(
                          (thread as any)?.messages?.[
                            (thread as any)?.messages?.length - 1
                          ]?.content ?? ""
                        )
                      )}
                    </span>
                  </span>
                  <div className="text-muted-foreground flex-shrink-0">
                    {thread?.createdAt
                      ? formatRelativeTime(thread?.createdAt as Date)
                      : null}
                  </div>
                </div>
              </Link>
            ))}
          </CardContent>
        </Card>
        <Pagination>
          <PaginationContent>
            <PaginationItem>
              <Link
                to="."
                search={(prev) => ({ ...prev, page: currentPage - 1 })}
                disabled={currentPage === 1}
                className={
                  buttonVariants({
                    variant: "ghost",
                    size: "default",
                  }) +
                  " gap-1 px-2.5 sm:pl-2.5" +
                  (currentPage === 1 ? " pointer-events-none opacity-50" : "")
                }
                aria-label="Go to previous page"
                aria-disabled={currentPage === 1}
                resetScroll={false}
              >
                <ChevronLeftIcon />
                <span className="hidden sm:block">Previous</span>
              </Link>
            </PaginationItem>
            {pageNumbers.map((pageNum, idx) => {
              if (pageNum === "ellipsis") {
                return (
                  <PaginationItem
                    key={`ellipsis-before-${pageNumbers[idx + 1]}`}
                  >
                    <PaginationEllipsis />
                  </PaginationItem>
                );
              }

              return (
                <PaginationItem key={pageNum}>
                  <Link
                    to="."
                    search={(prev) => ({ ...prev, page: pageNum })}
                    aria-current={page === pageNum ? "page" : undefined}
                    className={buttonVariants({
                      variant: page === pageNum ? "outline" : "ghost",
                      size: "icon",
                    })}
                    resetScroll={false}
                  >
                    {pageNum}
                  </Link>
                </PaginationItem>
              );
            })}
            <PaginationItem>
              <Link
                to="."
                search={(prev) => ({ ...prev, page: currentPage + 1 })}
                disabled={currentPage === numPages}
                className={
                  buttonVariants({
                    variant: "ghost",
                    size: "default",
                  }) +
                  " gap-1 px-2.5 sm:pr-2.5" +
                  (currentPage === numPages
                    ? " pointer-events-none opacity-50"
                    : "")
                }
                aria-label="Go to next page"
                aria-disabled={currentPage === numPages}
                resetScroll={false}
              >
                <span className="hidden sm:block">Next</span>
                <ChevronRightIcon />
              </Link>
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      </div>
    </div>
  );
}
