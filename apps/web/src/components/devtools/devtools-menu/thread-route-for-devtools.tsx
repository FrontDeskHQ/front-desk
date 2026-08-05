"use client";

import { useParams } from "@tanstack/react-router";
import { getDefaultStore } from "jotai/vanilla";

import { activeOrganizationAtom } from "~/lib/atoms";
import { fetchClient } from "~/lib/live-state";
import { parseThreadParam } from "~/utils/thread";

const THREAD_DETAIL_ROUTE = "/app/_workspace/_main/threads/$id/";

export const useThreadRouteRawParam = (): string | null => {
  // Always call useParams unconditionally. shouldThrow:false returns undefined
  // when the thread detail route is not matched, instead of throwing mid-hooks.
  const params = useParams({
    from: THREAD_DETAIL_ROUTE,
    shouldThrow: false,
  });

  return params?.id ?? null;
};

export const resolveThreadUlid = async (
  rawParam: string
): Promise<string | null> => {
  const parsed = parseThreadParam(rawParam);
  if (!parsed) {
    return null;
  }
  if (parsed.kind === "ulid") {
    return parsed.id;
  }
  const orgId = getDefaultStore().get(activeOrganizationAtom)?.id;
  if (!orgId) {
    return null;
  }
  const thread = await fetchClient.query.thread.detail({
    organizationId: orgId,
    shortId: parsed.shortId,
  });
  return thread?.id ?? null;
};
