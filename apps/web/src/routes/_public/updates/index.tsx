import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@workspace/ui/components/tooltip";
import browserCollections from "fumadocs-mdx:collections/browser";
import { LinkIcon, Sparkles } from "lucide-react";

import { source } from "~/lib/source";
import { seo } from "~/utils/seo";
import { absoluteAssetUrl, getBaseUrl } from "~/utils/url";

import defaultOgImage from "../../../assets/frontdesk-og.png";

const getUpdates = createServerFn({
  method: "GET",
}).handler(async () => {
  const pages = source.getPages();

  const sortedPages = pages
    .filter((page) => page.data.publishedAt) // Only include pages with publishedAt dates
    .toSorted((a, b) => {
      const dateA = new Date(a.data.publishedAt as string).getTime();
      const dateB = new Date(b.data.publishedAt as string).getTime();
      return dateB - dateA; // Descending order (newest first)
    });

  return {
    pages: sortedPages.map((page) => ({
      image: (page.data.image as string) ?? "",
      path: page.path,
      publishedAt: (page.data.publishedAt as string) ?? "",
      slug: page.path.replace(/\.mdx?$/, ""),
      summary: (page.data.summary as string) ?? "",
      tag: (page.data.tag as string) ?? "",
      title: page.data.title,
    })),
  };
});

const clientLoader = browserCollections.updates.createClientLoader({
  component({ default: MdxComponent }) {
    return (
      <div className="customProse">
        <MdxComponent />
      </div>
    );
  },
});

export const Route = createFileRoute("/_public/updates/")({
  component: RouteComponent,
  validateSearch: (search: Record<string, unknown>): { post?: string } => {
    return typeof search.post === "string" ? { post: search.post } : {};
  },
  loaderDeps: ({ search }) => ({ post: search.post }),
  loader: async ({ deps }) => {
    const data = await getUpdates();
    // Preload all pages
    await Promise.all(
      data.pages.map((page) => clientLoader.preload(page.path))
    );
    return {
      ...data,
      selectedPage: data.pages.find((page) => page.slug === deps.post) ?? null,
    };
  },
  head: ({ loaderData }) => {
    const page = loaderData?.selectedPage;
    const description =
      page?.summary ??
      "New features, product improvements, and fixes from FrontDesk.";
    const title = `${page?.title ?? "FrontDesk"} - Changelog`;
    const canonicalUrl = page
      ? `${getBaseUrl()}/updates?post=${encodeURIComponent(page.slug)}`
      : `${getBaseUrl()}/updates`;

    return {
      meta: [
        ...seo({
          title,
          description,
          url: canonicalUrl,
          siteName: "FrontDesk",
          author: "FrontDesk",
          openGraph: {
            title,
            description,
            image: absoluteAssetUrl(page?.image || defaultOgImage),
            url: canonicalUrl,
            type: page ? "article" : "website",
          },
        }),
        ...(page
          ? [
              {
                content: page.publishedAt,
                property: "article:published_time",
              },
            ]
          : []),
      ],
    };
  },
});

function formatPublishedDate(publishedAt: string) {
  const [year, month, day] = publishedAt.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en-US", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function RouteComponent() {
  const data = Route.useLoaderData();

  return (
    <TooltipProvider>
      <div className="flex w-full flex-col gap-8 border-x">
        <div className="col-span-full font-medium pt-12 pb-6 px-4 border-b text-2xl">
          What&apos;s new?
        </div>
        <div className="flex flex-col gap-2 px-4">
          {data.pages.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center space-y-4 ml-3 md:ml-4">
              <div className="p-6 rounded-full bg-muted/30 mb-2">
                <Sparkles className="w-10 h-10 text-muted-foreground" />
              </div>
              <h2 className="text-2xl font-semibold">No updates yet</h2>
              <p className="text-muted-foreground max-w-md">
                We're busy building exciting new features. Stay tuned for our
                first update!
              </p>
            </div>
          ) : (
            <div className="relative border-l ml-3 md:ml-4 space-y-20 pb-20">
              {data.pages.map((page, index) => {
                const Content = clientLoader.getComponent(page.path);
                const permalink = `/updates?post=${encodeURIComponent(page.slug)}#${encodeURIComponent(page.slug)}`;

                return (
                  <div
                    key={page.path}
                    id={page.slug}
                    className="relative pl-8 md:pl-12 scroll-mt-24 grid md:grid-cols-[250px_1fr] gap-8"
                  >
                    <div className="relative md:sticky md:top-24 h-fit self-start">
                      <div
                        className={`absolute -left-[37.5px] md:-left-[53.5px] top-2 h-2.5 w-2.5 rounded-full ring-4 ring-background transition-colors duration-200 ${
                          index === 0
                            ? "bg-[#345BCA]"
                            : "bg-muted-foreground/30"
                        }`}
                      />
                      <div className="text-sm text-muted-foreground font-mono mb-2">
                        {formatPublishedDate(page.publishedAt)}
                      </div>
                      <div className="group flex items-start gap-2">
                        <h2 className="text-xl leading-tight">{page.title}</h2>
                        <Tooltip>
                          <TooltipTrigger
                            render={
                              <a
                                aria-label={`Permalink to ${page.title}`}
                                className="mt-0.5 rounded-sm p-1 text-muted-foreground opacity-60 transition hover:bg-muted hover:text-foreground md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100"
                                href={permalink}
                              >
                                <LinkIcon
                                  aria-hidden="true"
                                  className="size-3.5"
                                />
                              </a>
                            }
                          />
                          <TooltipContent>Link to this update</TooltipContent>
                        </Tooltip>
                      </div>
                    </div>
                    <div className="min-w-0">
                      <Content />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </TooltipProvider>
  );
}
