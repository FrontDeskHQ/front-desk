import { useControllableState } from "@radix-ui/react-use-controllable-state";
import type { Level } from "@tiptap/extension-heading";
import { Placeholder } from "@tiptap/extensions";
import { EditorContent, type JSONContent, useEditor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import { parse } from "@workspace/ui/lib/md-tiptap";
import { EditorExtensions, KeyBinds } from "@workspace/ui/lib/tiptap";
import { cn } from "@workspace/ui/lib/utils";
import {
  ALargeSmall,
  ArrowUp,
  Bold,
  ChevronDown,
  ChevronDown as ChevronDownIcon,
  Code,
  Italic,
  List,
  Quote,
  SquareCode,
  Strikethrough,
} from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";
import { Button } from "../button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "../dropdown-menu";
import { Toggle } from "../toggle";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../tooltip";

export function InputBox({
  className,
  value,
  onValueChange,
  initialValue,
  onSubmit,
  clearOnSubmit = true,
  ...props
}: Omit<React.ComponentProps<"div">, "value" | "onValueChange" | "onSubmit"> & {
  value?: JSONContent[];
  initialValue?: JSONContent[];
  onValueChange?: (value: JSONContent[]) => void;
  onSubmit?: (value: JSONContent[]) => void;
  clearOnSubmit?: boolean;
}) {
  const [_value, setValue] = useControllableState<JSONContent[]>({
    defaultProp: initialValue ?? [],
    prop: value,
    onChange: onValueChange,
  });

  const disableSend = !_value.length || !_value[0]?.content;

  // TODO paste markdown
  const editor = useEditor({
    extensions: [
      ...EditorExtensions,
      Placeholder.configure({
        placeholder: "Write a reply...",
      }),
      KeyBinds.configure({
        keybinds: {
          "Mod-Enter": ({ editor }) => {
            const content = editor.getJSON().content;
            if (content.length && content[0]?.content?.length) {
              handleSubmit(content);
            }

            return true;
          },
        },
      }),
    ],
    content: _value,
    onUpdate: ({ editor }) => {
      setValue(editor.getJSON().content);
    },
  });

  const handleSubmit = (content: JSONContent[]) => {
    onSubmit?.(content);
    if (clearOnSubmit) {
      editor.commands.setContent([]);
    }
  };

  const containerRef = useRef<HTMLDivElement>(null);

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: we are using the div to focus the editor
    <div
      className={cn(
        "border-input border focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] rounded-md px-4 py-2 flex flex-col gap-2 cursor-text",
        className,
      )}
      onClick={() => editor?.chain().focus().run()}
      onKeyUp={() => editor?.chain().focus().run()}
      {...props}
    >
      <EditorContent
        editor={editor}
        className="max-h-96 overflow-y-auto placeholder:text-muted-foreground"
      />
      <BubbleMenu
        className="bg-[#1B1B1E] border rounded-sm shadow"
        editor={editor}
      >
        <TooltipProvider timeout={500}>
          <div ref={containerRef} className="flex items-center">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Toggle
                  data-state={editor.isActive("code") ? "on" : "off"}
                  className="hover:text-popover-foreground text-popover-foreground py-0 px-2 gap-0.5 w-13"
                >
                  <ALargeSmall className="size-5.5" />
                  <ChevronDown className="size-3" />
                </Toggle>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                portalProps={{ container: containerRef.current }}
                className="bg-[#1B1B1E] border rounded-sm shadow"
                side="top"
              >
                <DropdownMenuRadioGroup
                  value={
                    editor.isActive("paragraph")
                      ? "paragraph"
                      : editor.isActive("heading", { level: 1 })
                        ? "heading-1"
                        : editor.isActive("heading", { level: 2 })
                          ? "heading-2"
                          : editor.isActive("heading", { level: 3 })
                            ? "heading-3"
                            : "heading-4"
                  }
                  onValueChange={(value) => {
                    if (value === "paragraph") {
                      editor.chain().focus().setParagraph().run();
                    } else {
                      editor
                        .chain()
                        .focus()
                        .setHeading({
                          level: parseInt(
                            value.replace("heading-", ""),
                          ) as Level,
                        })
                        .run();
                    }
                  }}
                >
                  <DropdownMenuRadioItem value={"paragraph"}>
                    Regular
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value={"heading-1"}>
                    Heading 1
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value={"heading-2"}>
                    Heading 2
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value={"heading-3"}>
                    Heading 3
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value={"heading-4"}>
                    Heading 4
                  </DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
            <Tooltip>
              <TooltipTrigger>
                <Toggle
                  onClick={() => editor.chain().focus().toggleBold().run()}
                  data-state={editor.isActive("bold") ? "on" : "off"}
                  className="hover:text-popover-foreground text-popover-foreground"
                >
                  <Bold />
                </Toggle>
              </TooltipTrigger>
              <TooltipContent keybind="mod-b">Bold</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger>
                <Toggle
                  onClick={() => editor.chain().focus().toggleItalic().run()}
                  data-state={editor.isActive("italic") ? "on" : "off"}
                  className="hover:text-popover-foreground text-popover-foreground"
                >
                  <Italic />
                </Toggle>
              </TooltipTrigger>
              <TooltipContent keybind="mod-i">Italic</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger>
                <Toggle
                  onClick={() => editor.chain().focus().toggleStrike().run()}
                  data-state={editor.isActive("strike") ? "on" : "off"}
                  className="hover:text-popover-foreground text-popover-foreground"
                >
                  <Strikethrough />
                </Toggle>
              </TooltipTrigger>
              <TooltipContent keybind="mod-shift-s">
                Strikethrough
              </TooltipContent>
            </Tooltip>
            {/* <Tooltip>
              <TooltipTrigger>
                <Toggle
                  onClick={() => editor.chain().focus().toggleLink().run()}
                  data-state={editor.isActive("link") ? "on" : "off"}
                  className="hover:text-popover-foreground text-popover-foreground"
                >
                  <Link />
                </Toggle>
              </TooltipTrigger>
              <TooltipContent keybind="mod-k">Link</TooltipContent>
            </Tooltip> */}
            <Tooltip>
              <TooltipTrigger>
                <Toggle
                  onClick={() =>
                    editor.chain().focus().toggleBlockquote().run()
                  }
                  data-state={editor.isActive("blockquote") ? "on" : "off"}
                  className="hover:text-popover-foreground text-popover-foreground"
                >
                  <Quote />
                </Toggle>
              </TooltipTrigger>
              <TooltipContent keybind="mod-shift-b">Blockquote</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger>
                <Toggle
                  onClick={() => editor.chain().focus().toggleCodeBlock().run()}
                  data-state={editor.isActive("codeBlock") ? "on" : "off"}
                  className="hover:text-popover-foreground text-popover-foreground"
                >
                  <SquareCode />
                </Toggle>
              </TooltipTrigger>
              <TooltipContent keybind="mod-alt-c">Code block</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger>
                <Toggle
                  onClick={() => editor.chain().focus().toggleCode().run()}
                  data-state={editor.isActive("code") ? "on" : "off"}
                  className="hover:text-popover-foreground text-popover-foreground"
                >
                  <Code />
                </Toggle>
              </TooltipTrigger>
              <TooltipContent keybind="mod-e">Code</TooltipContent>
            </Tooltip>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Toggle
                  data-state={editor.isActive("code") ? "on" : "off"}
                  className="hover:text-popover-foreground text-popover-foreground py-0 px-2 gap-0.5 w-13"
                >
                  <List />
                  <ChevronDown className="size-3" />
                </Toggle>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                portalProps={{ container: containerRef.current }}
                className="bg-[#1B1B1E] border rounded-sm shadow"
                side="top"
              >
                <DropdownMenuRadioGroup
                  value={
                    editor.isActive("bulletList")
                      ? "bulletList"
                      : editor.isActive("orderedList")
                        ? "orderedList"
                        : undefined
                  }
                  onValueChange={(value) => {
                    if (value === "bulletList") {
                      editor.chain().focus().toggleBulletList().run();
                    } else if (value === "orderedList") {
                      editor.chain().focus().toggleOrderedList().run();
                    } else {
                      editor.chain().focus().setParagraph().run();
                    }
                  }}
                >
                  <DropdownMenuRadioItem value={"bulletList"}>
                    List
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value={"orderedList"}>
                    Numbered List
                  </DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </TooltipProvider>
      </BubbleMenu>

      <div className="flex justify-end">
        <Button
          size="sm"
          variant={disableSend ? "secondary" : "default"}
          disabled={disableSend}
          onClick={() => handleSubmit(_value)}
        >
          <ArrowUp />
          Reply
        </Button>
      </div>
    </div>
  );
}

export function RichText({ content }: { content?: JSONContent[] | string }) {
  const editor = useEditor({
    content: [],
    editable: false,
    extensions: EditorExtensions,
  });

  useLayoutEffect(() => {
    if (!editor) return;
    if (typeof content === "string") {
      editor.commands.setContent(parse(content));
    } else {
      editor.commands.setContent(content ?? []);
    }
  }, [content, editor]);

  return <EditorContent editor={editor} />;
}

export function TruncatedText({
  children,
  maxHeight = 256,
  className,
  showMoreText = "Show more",
  showLessText = "Show less",
  ...props
}: React.ComponentProps<"div"> & {
  maxHeight?: number;
  showMoreText?: string;
  showLessText?: string;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isOverflowing, setIsOverflowing] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const element = contentRef.current;
    if (!element) return;

    const checkOverflow = () => {
      setIsOverflowing(element.scrollHeight > maxHeight);
    };

    checkOverflow();

    // Check on resize
    const resizeObserver = new ResizeObserver(checkOverflow);
    resizeObserver.observe(element);

    return () => {
      resizeObserver.disconnect();
    };
  }, [maxHeight]);

  const handleToggle = () => {
    setIsExpanded(!isExpanded);
  };

  return (
    <div className={cn("relative", className)} {...props}>
      <div
        ref={contentRef}
        className={cn(
          "overflow-hidden transition-all duration-200 relative",
          !isExpanded && "max-h-0",
          isOverflowing && !isExpanded && "mask-b-from-70% mask-b-to-100%",
        )}
        style={{
          maxHeight: isExpanded ? "none" : `${maxHeight}px`,
        }}
      >
        {children}
      </div>
      {isOverflowing && (
        <Button
          variant="ghost"
          size="sm"
          onClick={handleToggle}
          className="text-muted-foreground hover:text-foreground mt-2"
        >
          {isExpanded ? showLessText : showMoreText}
          <ChevronDownIcon
            className={cn(
              "ml-1 h-4 w-4 transition-transform duration-200",
              isExpanded && "rotate-180",
            )}
          />
        </Button>
      )}
    </div>
  );
}
