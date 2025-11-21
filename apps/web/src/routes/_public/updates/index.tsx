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
  component({ frontmatter, default: MDX }) {
    return (
      <div className="customProse">
        <h1>{frontmatter.title}</h1>
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
    <div className="max-w-6xl flex flex-col">
      <h1 className="text-4xl font-bold py-8">What's new?</h1>
      <div className="flex">
        <div className="w-1/4">timeline</div>
        <div className="w-3/4">
          {data.pages.map((page) => {
            const Content = clientLoader.getComponent(page.path);
            return (
              <div
                key={page.path}
                className="border-b last:border-b-0 m-0 py-8"
              >
                <Content />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
