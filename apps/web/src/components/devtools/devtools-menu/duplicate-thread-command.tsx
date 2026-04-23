"use client";

import { getRouteApi, useNavigate } from "@tanstack/react-router";
import { MenuItem } from "@workspace/ui/components/menu";
import { toast } from "sonner";
import { ulid } from "ulid";
import { getDefaultStore } from "jotai/vanilla";
import { activeOrganizationAtom } from "~/lib/atoms";
import { fetchClient } from "~/lib/live-state";
import { parseThreadParam } from "~/utils/thread";

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
        where = { shortId: parsed.shortId, organizationId: activeOrgId };
      }
      const thread = await fetchClient.query.thread
        .first(where)
        .include({
          author: true,
          messages: { include: { author: true } },
        })
        .get();

      if (!thread) {
        toast.error("Thread not found");
        return;
      }

      const messages = thread.messages ?? [];
      const sortedMessages = [...messages].sort(
        (a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      );
      const firstMessage = sortedMessages[0];

      const newThreadId = ulid().toLowerCase();
      const now = new Date();

      await fetchClient.mutate.thread.insert({
        id: newThreadId,
        name: thread.name,
        authorId: thread.authorId,
        organizationId: thread.organizationId,
        createdAt: now,
        deletedAt: null,
        discordChannelId: null,
        externalId: null,
        externalOrigin: null,
        externalMetadataStr: null,
        externalIssueId: null,
        externalPrId: null,
        assignedUserId: null,
        status: 0,
        priority: 0,
      });

      if (firstMessage) {
        await fetchClient.mutate.message.insert({
          id: ulid().toLowerCase(),
          authorId: firstMessage.authorId,
          content: firstMessage.content,
          threadId: newThreadId,
          createdAt: now,
          origin: null,
          externalMessageId: null,
        });
      }

      toast.success("Thread duplicated");
      navigate({ to: "/app/threads/$id", params: { id: newThreadId } });
    } catch (err) {
      console.error("Failed to duplicate thread:", err);
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
