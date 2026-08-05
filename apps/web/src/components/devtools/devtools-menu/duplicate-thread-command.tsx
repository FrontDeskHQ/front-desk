"use client";

import { useNavigate } from "@tanstack/react-router";
import { MenuItem } from "@workspace/ui/components/menu";
import { getDefaultStore } from "jotai/vanilla";
import { toast } from "sonner";

import { activeOrganizationAtom } from "~/lib/atoms";
import { fetchClient } from "~/lib/live-state";
import { buildThreadParam, parseThreadParam } from "~/utils/thread";

import { useThreadRouteRawParam } from "./thread-route-for-devtools";

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

export type DuplicatedThread = Awaited<
  ReturnType<typeof fetchClient.mutate.thread.create>
>;

export const duplicateThreadFromParam = async ({
  activeOrganizationId,
  onSuccess,
  rawParam,
}: {
  activeOrganizationId?: string;
  onSuccess?: (thread: DuplicatedThread) => void;
  rawParam: string | null;
}): Promise<void> => {
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
      if (!activeOrganizationId) {
        toast.error("No active organization");
        return;
      }
      where = { organizationId: activeOrganizationId, shortId: parsed.shortId };
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
    onSuccess?.(newThread);
  } catch (error) {
    console.error("Failed to duplicate thread:", error);
    toast.error("Failed to duplicate thread");
  }
};

export const DuplicateThreadMenuItem = () => {
  const navigate = useNavigate();
  const rawParam = useThreadRouteRawParam();

  const handleDuplicateThread = () =>
    duplicateThreadFromParam({
      activeOrganizationId: getDefaultStore().get(activeOrganizationAtom)?.id,
      onSuccess: (thread) => {
        navigate({
          params: { id: buildThreadParam(thread) },
          to: "/app/threads/$id",
        });
      },
      rawParam,
    });

  return (
    <MenuItem
      disabled={!rawParam}
      onClick={handleDuplicateThread}
      aria-label="Duplicate current thread (title, first message and author)"
    >
      Duplicate thread
    </MenuItem>
  );
};
