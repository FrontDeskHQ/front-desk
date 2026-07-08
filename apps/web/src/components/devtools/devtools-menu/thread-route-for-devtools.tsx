"use client";

import { getRouteApi } from "@tanstack/react-router";
import { getDefaultStore } from "jotai/vanilla";
import { activeOrganizationAtom } from "~/lib/atoms";
import { fetchClient } from "~/lib/live-state";
import { parseThreadParam } from "~/utils/thread";

export const useThreadRouteRawParam = (): string | null => {
  try {
    return getRouteApi("/app/_workspace/_main/threads/$id/").useParams().id;
  } catch {
    return null;
  }
};

export const resolveThreadUlid = async (
  rawParam: string,
): Promise<string | null> => {
  const parsed = parseThreadParam(rawParam);
  if (!parsed) return null;
  if (parsed.kind === "ulid") return parsed.id;
  const orgId = getDefaultStore().get(activeOrganizationAtom)?.id;
  if (!orgId) return null;
  const thread = await fetchClient.query.thread.detail({
    shortId: parsed.shortId,
    organizationId: orgId,
  });
  return thread?.id ?? null;
};
