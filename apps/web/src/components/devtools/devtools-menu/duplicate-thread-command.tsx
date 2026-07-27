"use client";

import { getRouteApi, useNavigate } from "@tanstack/react-router";
import { MenuItem } from "@workspace/ui/components/menu";
import { getDefaultStore } from "jotai/vanilla";
import { toast } from "sonner";

import { activeOrganizationAtom } from "~/lib/atoms";
import { fetchClient } from "~/lib/live-state";
import { buildThreadParam, parseThreadParam } from "~/utils/thread";

const parseThreadMessage = (content: string | undefined) => {
  if (!content) {
    return "Duplicated thread";
  }

  try {
    return JSON.parse(content) as unknown;
  } catch {
    return content;
  }
};

export const DuplicateThreadMenuItem = () => {
  const navigate = useNavigate();
  const { id: rawParam } = (() => {
    try {
      return getRouteApi("/app/_workspace/_main/threads/$id/").useParams();
    } catch {
      return { id: null };
    }
  })();

  const handleDuplicateThread = async () => {
    if (!rawParam) {
      toast.error("Open a thread first to duplicate it");
      return;
    }

    const parsed = parseThreadParam(rawParam);
    if (!parsed) {
      toast.error("Invalid thread");
      return;
    }

    try {
      let where: { id: string } | { shortId: number; organizationId: string };
      if (parsed.kind === "ulid") {
        where = { id: parsed.id };
      } else {
        const activeOrgId = getDefaultStore().get(activeOrganizationAtom)?.id;
        if (!activeOrgId) {
          toast.error("No active organization");
          return;
        }
        where = { organizationId: activeOrgId, shortId: parsed.shortId };
      }
      const thread = await fetchClient.query.thread.detail(where);

      if (!thread) {
        toast.error("Thread not found");
        return;
      }

      const messages = thread.messages ?? [];
      const sortedMessages = [...messages].toSorted(
        (a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );
      const firstMessage = sortedMessages[0];

      const authorName = thread.author?.name ?? "Unknown";
      const authorMetaId =
        thread.author?.metaId ??
        thread.author?.userId ??
        `duplicate-${thread.authorId}`;

      const newThread = await fetchClient.mutate.thread.create({
        author: {
          id: authorMetaId,
          name: authorName,
        },
        message: parseThreadMessage(firstMessage?.content),
        organizationId: thread.organizationId,
        title: thread.name,
      });

      toast.success("Thread duplicated");
      navigate({
        params: { id: buildThreadParam(newThread) },
        to: "/app/threads/$id",
      });
    } catch (error) {
      console.error("Failed to duplicate thread:", error);
      toast.error("Failed to duplicate thread");
    }
  };

  return (
    <MenuItem
      onClick={handleDuplicateThread}
      aria-label="Duplicate current thread (title, first message and author)"
    >
      Duplicate thread
    </MenuItem>
  );
};
