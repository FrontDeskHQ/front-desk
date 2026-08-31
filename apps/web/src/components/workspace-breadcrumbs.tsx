import { Link, useMatches } from "@tanstack/react-router";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@workspace/ui/components/breadcrumb";
import { cn } from "@workspace/ui/lib/utils";
import type { ComponentType, ReactNode } from "react";
import { Fragment } from "react";

import type { Breadcrumb as BreadcrumbValue } from "~/lib/route-meta";

import { CollapsedSidebarTrigger } from "./sidebar/collapsed-sidebar-trigger";

type WorkspaceRoutePath = Exclude<
  ReturnType<typeof useMatches>[number]["fullPath"],
  ""
>;

interface WorkspaceBreadcrumbsProps {
  className?: string;
  current?: ReactNode;
}

function BreadcrumbValue({ value }: { value: BreadcrumbValue }) {
  if (typeof value === "string") {
    return value;
  }

  const Component = value as ComponentType;
  return <Component />;
}

function WorkspaceBreadcrumbs({
  className,
  current,
}: WorkspaceBreadcrumbsProps) {
  const matches = useMatches();
  const matchesWithBreadcrumbs = matches.flatMap((match) => {
    const breadcrumb = match.staticData.breadcrumb;
    return breadcrumb === undefined ? [] : [{ breadcrumb, match }];
  });
  const hasCurrentOverride = current !== undefined;
  const currentMatch = hasCurrentOverride
    ? undefined
    : matchesWithBreadcrumbs.at(-1);
  const ancestorMatches = hasCurrentOverride
    ? matchesWithBreadcrumbs
    : matchesWithBreadcrumbs.slice(0, -1);

  return (
    <div className={cn("flex min-w-0 items-center gap-2", className)}>
      <CollapsedSidebarTrigger />
      {(currentMatch || hasCurrentOverride) && (
        <Breadcrumb className="min-w-0 flex-1">
          <BreadcrumbList className="min-w-0 flex-nowrap">
            {ancestorMatches.map(({ breadcrumb, match }) => (
              <Fragment key={match.id}>
                <BreadcrumbItem className="shrink-0">
                  <BreadcrumbLink asChild>
                    <Link from={match.fullPath as WorkspaceRoutePath} to=".">
                      <BreadcrumbValue value={breadcrumb} />
                    </Link>
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator className="shrink-0" />
              </Fragment>
            ))}
            <BreadcrumbItem className="min-w-0">
              <BreadcrumbPage className="flex min-w-0 items-center gap-1.5">
                {hasCurrentOverride ? (
                  current
                ) : currentMatch ? (
                  <BreadcrumbValue value={currentMatch.breadcrumb} />
                ) : null}
              </BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      )}
    </div>
  );
}

export { WorkspaceBreadcrumbs };
