import { createMDX } from "fumadocs-mdx/next";

const withMDX = createMDX();

/** @type {import('next').NextConfig} */
const config = {
  basePath: "/docs",
  reactStrictMode: true,
  async rewrites() {
    return [
      {
        source: "/:path*.mdx",
        destination: "/md/:path*",
      },
      {
        source: "/:path*.md",
        destination: "/md/:path*",
      },
    ];
  },
};

export default withMDX(config);
