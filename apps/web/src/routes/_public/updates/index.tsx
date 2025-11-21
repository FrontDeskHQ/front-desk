import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import browserCollections from "fumadocs-mdx:collections/browser";
import { source } from "~/lib/source";

const loader = createServerFn({
  method: "GET",
}).handler(async () => {
  const pages = source.getPages();

  const sortedPages = pages
    .filter((page) => page.data.publishedAt) // Only include pages with publishedAt dates
    .sort((a, b) => {
      const dateA = new Date(a.data.publishedAt as string).getTime();
      const dateB = new Date(b.data.publishedAt as string).getTime();
      return dateB - dateA; // Descending order (newest first)
    });

  return {
    pages: sortedPages.map((page) => ({
      path: page.path,
      title: page.data.title,
      publishedAt: page.data.publishedAt as string,
      summary: page.data.summary as string,
      tag: page.data.tag as string,
      image: page.data.image as string,
    })),
  };
});

const clientLoader = browserCollections.docs.createClientLoader({
  component({ default: MDX }) {
    return (
      <div className="customProse">
        <MDX />
      </div>
    );
  },
});

export const Route = createFileRoute("/_public/updates/")({
  component: RouteComponent,
  loader: async () => {
    const data = await loader();
    // Preload all pages
    await Promise.all(
      data.pages.map((page) => clientLoader.preload(page.path)),
    );
    return data;
  },
});

function RouteComponent() {
  const data = Route.useLoaderData();

  return (
    <div className="max-w-5xl flex flex-col mx-auto px-4">
      <h1 className="text-4xl font-bold py-8">What's new?</h1>
      <div className="relative border-l border-border ml-3 md:ml-4 space-y-20 pb-20">
        {data.pages.map((page, index) => {
          const Content = clientLoader.getComponent(page.path);
          return (
            <div
              key={page.path}
              id={page.path}
              className="relative pl-8 md:pl-12 scroll-mt-24 grid md:grid-cols-[250px_1fr] gap-8"
            >
              <div className="relative md:sticky md:top-24 h-fit self-start">
                <div
                  className={`absolute -left-[37px] md:-left-[53px] top-2 h-2.5 w-2.5 rounded-full ring-4 ring-background transition-colors duration-200 ${
                    index === 0 ? "bg-[#345BCA]" : "bg-muted-foreground/30"
                  }`}
                />
                <div className="text-sm text-muted-foreground font-medium mb-2">
                  {new Date(page.publishedAt).toLocaleDateString("en-US", {
                    month: "long",
                    day: "numeric",
                    year: "numeric",
                  })}
                </div>
                <h2 className="text-xl font-bold leading-tight">
                  {page.title}
                </h2>
              </div>
              <div className="min-w-0">
                <Content />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
