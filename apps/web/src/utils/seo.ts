export const seo = ({
  title,
  description,
  keywords,
  image,
  url,
  type = "website",
  siteName = "FrontDesk",
  locale = "en_US",
  author,
  robots,
}: {
  title: string;
  description?: string;
  image?: string;
  keywords?: string;
  url?: string;
  type?: "website" | "article" | "profile" | "book" | "video" | "music";
  siteName?: string;
  locale?: string;
  author?: string;
  robots?: string;
}) => {
  const tags = [
    // Basic meta tags
    { title },
    { name: "description", content: description },
    { name: "keywords", content: keywords },
    { name: "author", content: author ?? "FrontDesk" },
    {
      name: "robots",
      content:
        robots ??
        "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1",
    },
    {
      name: "googlebot",
      content:
        "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1",
    },
    {
      name: "bingbot",
      content:
        "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1",
    },

    // Open Graph tags
    { property: "og:type", content: type },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
    { property: "og:site_name", content: siteName },
    { property: "og:locale", content: locale },
    { property: "og:url", content: url ?? "" },
    ...(image
      ? [
          { property: "og:image", content: image },
          { property: "og:image:secure_url", content: image },
          { property: "og:image:type", content: "image/png" },
          { property: "og:image:width", content: "1200" },
          { property: "og:image:height", content: "630" },
          { property: "og:image:alt", content: title },
        ]
      : []),

    // Twitter Card tags
    {
      name: "twitter:card",
      content: image ? "summary_large_image" : "summary",
    },
    { name: "twitter:title", content: title },
    { name: "twitter:description", content: description },
    { name: "twitter:creator", content: "@frontdeskhq" },
    { name: "twitter:site", content: "@frontdeskhq" },
    ...(image
      ? [
          { name: "twitter:image", content: image },
          { name: "twitter:image:alt", content: title },
          { name: "twitter:image:width", content: "1200" },
          { name: "twitter:image:height", content: "630" },
        ]
      : []),

    // Additional SEO tags
    { name: "theme-color", content: "#ffffff" },
    { name: "format-detection", content: "telephone=no" },
    { name: "apple-mobile-web-app-capable", content: "yes" },
    { name: "apple-mobile-web-app-status-bar-style", content: "default" },
    { name: "apple-mobile-web-app-title", content: siteName },
    { name: "mobile-web-app-capable", content: "yes" },
    { name: "application-name", content: siteName },
    { name: "msapplication-TileColor", content: "#ffffff" },
    { name: "msapplication-config", content: "/site.webmanifest" },

    // Structured data hints
    { name: "referrer", content: "no-referrer-when-downgrade" },
    { name: "rating", content: "general" },
    { name: "distribution", content: "global" },
  ];

  return tags;
};
