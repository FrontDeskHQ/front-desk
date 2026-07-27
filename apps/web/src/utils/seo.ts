export const seo = ({
  title,
  description,
  keywords,
  url,
  siteName = "FrontDesk",
  locale = "en_US",
  author,
  openGraph,
}: {
  title: string;
  description?: string;
  keywords?: string;
  url?: string;
  siteName?: string;
  locale?: string;
  author?: string;
  openGraph?: {
    title?: string;
    description?: string;
    image?: string;
    url?: string;
    type?: "website" | "article" | "profile" | "book" | "video" | "music";
    siteName?: string;
    locale?: string;
  };
}) => {
  const tags = [
    // Basic meta tags
    { title },
    ...(description ? [{ content: description, name: "description" }] : []),
    ...(keywords ? [{ content: keywords, name: "keywords" }] : []),
    ...(author ? [{ content: author, name: "author" }] : []),

    // Open Graph tags
    ...(openGraph
      ? [
          { content: openGraph.type ?? "website", property: "og:type" },
          { content: openGraph.title ?? title, property: "og:title" },
          ...(description
            ? [
                {
                  content: openGraph.description ?? description,
                  property: "og:description",
                },
              ]
            : []),
          ...(siteName
            ? [
                {
                  content: openGraph.siteName ?? siteName,
                  property: "og:site_name",
                },
              ]
            : []),
          ...(locale
            ? [{ content: openGraph.locale ?? locale, property: "og:locale" }]
            : []),
          ...(url ? [{ content: url, property: "og:url" }] : []),
          ...(openGraph.image
            ? [
                { content: openGraph.image, property: "og:image" },
                { content: openGraph.image, property: "og:image:secure_url" },
                { content: "image/png", property: "og:image:type" },
                { content: "1200", property: "og:image:width" },
                { content: "630", property: "og:image:height" },
                { content: openGraph.title ?? title, property: "og:image:alt" },
              ]
            : []),

          // Twitter Card tags
          ...(openGraph.image
            ? [
                {
                  content: openGraph.image ? "summary_large_image" : "summary",
                  name: "twitter:card",
                },
              ]
            : [{ content: "summary", name: "twitter:card" }]),
          { content: openGraph.title ?? title, name: "twitter:title" },
          ...(description
            ? [
                {
                  content: openGraph.description ?? description,
                  name: "twitter:description",
                },
              ]
            : []),
          { content: "@frontdeskhq", name: "twitter:creator" },
          { content: "@frontdeskhq", name: "twitter:site" },
          ...(openGraph.image
            ? [
                { content: openGraph.image, name: "twitter:image" },
                {
                  content: openGraph.title ?? title,
                  name: "twitter:image:alt",
                },
                { content: "1200", name: "twitter:image:width" },
                { content: "630", name: "twitter:image:height" },
              ]
            : []),
        ]
      : []),

    // Additional SEO tags
    { content: "#ffffff", name: "theme-color" },
    { content: "telephone=no", name: "format-detection" },
    { content: "yes", name: "apple-mobile-web-app-capable" },
    { content: "default", name: "apple-mobile-web-app-status-bar-style" },
    ...(siteName
      ? [{ content: siteName, name: "apple-mobile-web-app-title" }]
      : []),
    { content: "yes", name: "mobile-web-app-capable" },
    ...(siteName ? [{ content: siteName, name: "application-name" }] : []),
    { content: "#ffffff", name: "msapplication-TileColor" },
    { content: "/site.webmanifest", name: "msapplication-config" },

    // Structured data hints
    { content: "no-referrer-when-downgrade", name: "referrer" },
    { content: "general", name: "rating" },
    { content: "global", name: "distribution" },
  ];

  return tags;
};
