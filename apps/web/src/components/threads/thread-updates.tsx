import type { InferLiveObject } from "@live-state/sync";
import type { schema } from "api/schema";
import { Update } from "~/components/threads/updates";

type UpdateItem = InferLiveObject<typeof schema.update, { user: true }>;

export function ThreadUpdates({
  updates,
  user,
}: {
  updates: UpdateItem[];
  user?: { id: string; name: string };
}) {
  return (
    <div className="flex flex-col gap-4 pl-3">
      {updates.map((update, i) => (
        <Update
          key={update.id}
          update={update}
          user={user}
          connectTop={i > 0}
        />
      ))}
    </div>
  );
}
