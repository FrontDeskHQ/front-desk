import { EditableRichText } from "@workspace/ui/components/blocks/tiptap";
import type { JSONContent } from "@workspace/ui/components/blocks/tiptap";
import { stringify } from "@workspace/utils/tiptap-md";
import { PenLineIcon } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback } from "react";

interface Props {
  open: boolean;
  draft: string;
  contentKey: string;
  onDraftChange: (draft: string) => void;
}

export function SignalReplyDraftEditor({
  open,
  draft,
  contentKey,
  onDraftChange,
}: Props) {
  const handleUpdate = useCallback(
    (value: JSONContent[]) => {
      onDraftChange(stringify(value));
    },
    [onDraftChange]
  );

  return (
    <AnimatePresence initial={false}>
      {open ? (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.15, ease: "easeInOut" }}
          className="overflow-hidden bg-background-tertiary"
        >
          <div className="space-y-2 px-3 pt-2 pb-0">
            <div className="flex items-center gap-1.5 text-xs text-foreground-secondary mt-1">
              <PenLineIcon className="size-3.5 shrink-0" />
              <span>Reply draft</span>
            </div>
            <div className="max-h-52 min-h-0 overflow-y-auto text-sm">
              <EditableRichText
                key={contentKey}
                content={draft}
                onUpdate={handleUpdate}
                className="[&_.ProseMirror]:p-0 [&_.ProseMirror]:min-h-0"
              />
            </div>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
