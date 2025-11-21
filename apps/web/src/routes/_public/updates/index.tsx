import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { Prose } from "@workspace/ui/components/prose";
import browserCollections from "fumadocs-mdx:collections/browser";
import { source } from "~/lib/source";

const loader = createServerFn({
  method: "GET",
}).handler(async () => {
  const pages = source.getPages();
  
  // Sort pages by date (newest first)
  const sortedPages = pages
    .filter((page) => page.data.date) // Only include pages with dates
    .sort((a, b) => {
      const dateA = new Date(a.data.date as string).getTime();
      const dateB = new Date(b.data.date as string).getTime();
      return dateB - dateA; // Descending order (newest first)
    });

  return {
    pages: sortedPages.map((page) => ({
      path: page.path,
      title: page.data.title,
      description: page.data.description,
      date: page.data.date as string,
    })),
  };
});

const clientLoader = browserCollections.docs.createClientLoader({
  component({ frontmatter, default: MDX }) {
    return (
      <Prose>
        <h1>{frontmatter.title}</h1>
        <MDX />
      </Prose>
    );
  },
});

export const Route = createFileRoute("/_public/updates/")({
  component: RouteComponent,
  loader: async () => {
    const data = await loader();
    // Preload all pages
    await Promise.all(data.pages.map((page) => clientLoader.preload(page.path)));
    return data;
  },
});

function RouteComponent() {
  const data = Route.useLoaderData();
  
  return (
    <div className="max-w-6xl my-8 space-y-8">
      {data.pages.map((page) => {
        const Content = clientLoader.getComponent(page.path);
        return (
          <div key={page.path} className="border-b pb-8 last:border-b-0">
            <Content />
          </div>
        );
      })}
    </div>
  );
}
