import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import browserCollections from "fumadocs-mdx:collections/browser";
import { source } from "~/lib/source";

const loader = createServerFn({
  method: "GET",
}).handler(async () => {
  const pages = source.getPages();
  return {
    path: pages.map((page) => page.path),
  };
});

const clientLoader = browserCollections.docs.createClientLoader({
  component({ frontmatter, default: MDX }) {
    return (
      <div className="prose">
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
    await clientLoader.preload(data.path[0]);
    return data;
  },
});

function RouteComponent() {
  const data = Route.useLoaderData();
  const Content = clientLoader.getComponent(data.path[0]);
  return <Content />;
}
