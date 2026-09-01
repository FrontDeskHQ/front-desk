import type { ComponentType } from "react";

export type Breadcrumb = string | ComponentType;

declare module "@tanstack/react-router" {
  interface StaticDataRouteOption {
    breadcrumb?: Breadcrumb;
  }
}
