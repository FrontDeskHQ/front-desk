/* mirror: reply editor — apps/web/src/components/threads/thread-toolbar/reply-editor.tsx
 * fork: apps/web/src/components/threads/thread-toolbar/reply-editor.tsx @ 59006b69
 *   why: mutate.message.create on submit + analytics capture
 * reuse: RichText, Button
 * state: draft content from fixture (display-only; inert mirror)
 * marketing: chrome matches EditorInput; RichText instead of live Editor
 *   (Editor initialValue crashes TipTap on non-empty JSONContent[])
 */

import { RichText } from "@workspace/ui/components/blocks/tiptap";
import { Button } from "@workspace/ui/components/button";
import { safeParseJSON } from "@workspace/ui/lib/tiptap";
import { cn } from "@workspace/ui/lib/utils";
import { ArrowUp } from "lucide-react";

interface MockReplyEditorProps {
  /** TipTap JSON string — same shape as message.content. */
  draft: string;
  className?: string;
}

export function MockReplyEditor({ draft, className }: MockReplyEditorProps) {
  return (
    <div data-slot="reply-editor">
      <div
        className={cn(
          "border-input border focus-within:border-ring focus-within:ring-ring/50 focus-within:ring-[3px] rounded-md px-4 py-2 flex flex-col gap-2 cursor-text relative transition-[color,box-shadow] shadow-lg bg-[#1B1B1E] border-0 border-b-0",
          className
        )}
      >
        <div className="customProse max-h-96 overflow-y-auto placeholder:text-muted-foreground">
          <RichText content={safeParseJSON(draft)} />
        </div>
        <div className="flex justify-end">
          <Button size="sm" variant="primary" tabIndex={-1}>
            <ArrowUp />
            Reply
          </Button>
        </div>
      </div>
    </div>
  );
}
