import type { InferLiveObject } from "@live-state/sync";
import type { schema } from "api/schema";
import { usePostHog } from "posthog-js/react";
import { useCallback } from "react";

type Thread = InferLiveObject<
  typeof schema.thread,
  { organization: true; messages: { author: true }; assignedUser: true }
>;

export function useThreadAnalytics(thread: Thread | undefined) {
  const posthog = usePostHog();

  const captureThreadEvent = useCallback(
    (eventName: string, properties?: Record<string, unknown>) => {
      posthog?.capture(eventName, {
        thread_id: thread?.id,
        thread_name: thread?.name,
        ...properties,
      });
    },
    [posthog, thread?.id, thread?.name]
  );

  return { captureThreadEvent };
}
