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
    ...(description ? [{ name: "description", content: description }] : []),
    ...(keywords ? [{ name: "keywords", content: keywords }] : []),
    ...(author ? [{ name: "author", content: author }] : []),

    // Open Graph tags
    ...(openGraph
      ? [
          { property: "og:type", content: openGraph.type ?? "website" },
          { property: "og:title", content: openGraph.title ?? title },
          ...(description
            ? [
                {
                  property: "og:description",
                  content: openGraph.description ?? description,
                },
              ]
            : []),
          ...(siteName
            ? [
                {
                  property: "og:site_name",
                  content: openGraph.siteName ?? siteName,
                },
              ]
            : []),
          ...(locale
            ? [{ property: "og:locale", content: openGraph.locale ?? locale }]
            : []),
          ...(url ? [{ property: "og:url", content: url }] : []),
          ...(openGraph.image
            ? [
                { property: "og:image", content: openGraph.image },
                { property: "og:image:secure_url", content: openGraph.image },
                { property: "og:image:type", content: "image/png" },
                { property: "og:image:width", content: "1200" },
                { property: "og:image:height", content: "630" },
                { property: "og:image:alt", content: openGraph.title ?? title },
              ]
            : []),

          // Twitter Card tags
          ...(openGraph.image
            ? [
                {
                  name: "twitter:card",
                  content: openGraph.image ? "summary_large_image" : "summary",
                },
              ]
            : [{ name: "twitter:card", content: "summary" }]),
          { name: "twitter:title", content: openGraph.title ?? title },
          ...(description
            ? [
                {
                  name: "twitter:description",
                  content: openGraph.description ?? description,
                },
              ]
            : []),
          { name: "twitter:creator", content: "@frontdeskhq" },
          { name: "twitter:site", content: "@frontdeskhq" },
          ...(openGraph.image
            ? [
                { name: "twitter:image", content: openGraph.image },
                {
                  name: "twitter:image:alt",
                  content: openGraph.title ?? title,
                },
                { name: "twitter:image:width", content: "1200" },
                { name: "twitter:image:height", content: "630" },
              ]
            : []),
        ]
      : []),

    // Additional SEO tags
    { name: "theme-color", content: "#ffffff" },
    { name: "format-detection", content: "telephone=no" },
    { name: "apple-mobile-web-app-capable", content: "yes" },
    { name: "apple-mobile-web-app-status-bar-style", content: "default" },
    ...(siteName
      ? [{ name: "apple-mobile-web-app-title", content: siteName }]
      : []),
    { name: "mobile-web-app-capable", content: "yes" },
    ...(siteName ? [{ name: "application-name", content: siteName }] : []),
    { name: "msapplication-TileColor", content: "#ffffff" },
    { name: "msapplication-config", content: "/site.webmanifest" },

    // Structured data hints
    { name: "referrer", content: "no-referrer-when-downgrade" },
    { name: "rating", content: "general" },
    { name: "distribution", content: "global" },
  ];

  return tags;
};
