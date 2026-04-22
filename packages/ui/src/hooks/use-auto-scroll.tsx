import { useCallback, useEffect, useRef, useState } from "react";

/*
 * This hook is a modified version of the useAutoScroll hook from shadcn-chat - by Jakob Hoeg Mørk
 * Original version: https://github.com/jakobhoeg/shadcn-chat/blob/47e5f8af020b6eacbd4cbd6ad5f6ff8d60e76aa8/packages/ui/src/components/ui/chat/hooks/useAutoScroll.tsx
 */

type UseAutoScrollOptions = {
  offset?: number;
  smooth?: boolean;
  content?: any;
};

export function useAutoScroll(options: UseAutoScrollOptions = {}) {
  const { offset = 128, smooth = false, content } = options;
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const lastContentHeight = useRef(0);
  const userHasScrolled = useRef(false);

  const [isAtBottom, setIsAtBottom] = useState(true);
  const autoScrollEnabled = useRef(true);

  const checkIsAtBottom = useCallback(
    (element: HTMLElement) => {
      const { scrollTop, scrollHeight, clientHeight } = element;
      const distanceToBottom = Math.abs(
        scrollHeight - scrollTop - clientHeight
      );
      return distanceToBottom <= offset;
    },
    [offset]
  );

  const scrollToBottom = useCallback(
    (instant?: boolean) => {
      if (!scrollRef.current) return;

      const targetScrollTop =
        scrollRef.current.scrollHeight - scrollRef.current.clientHeight;

      if (instant) {
        scrollRef.current.scrollTop = targetScrollTop;
      } else {
        scrollRef.current.scrollTo({
          top: targetScrollTop,
          behavior: smooth ? "smooth" : "auto",
        });
      }

      setIsAtBottom(true);
      autoScrollEnabled.current = true;
      userHasScrolled.current = false;
    },
    [smooth]
  );

  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return;

    const atBottom = checkIsAtBottom(scrollRef.current);

    setIsAtBottom(atBottom);
    autoScrollEnabled.current = atBottom;
  }, [checkIsAtBottom]);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;

    element.addEventListener("scroll", handleScroll, { passive: true });
    return () => element.removeEventListener("scroll", handleScroll);
  }, [handleScroll]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: content is required
  useEffect(() => {
    const scrollElement = scrollRef.current;
    if (!scrollElement) return;

    const currentHeight = scrollElement.scrollHeight;
    const hasNewContent = currentHeight !== lastContentHeight.current;

    if (hasNewContent) {
      if (autoScrollEnabled.current) {
        requestAnimationFrame(() => {
          scrollToBottom(lastContentHeight.current === 0);
        });
      }
      lastContentHeight.current = currentHeight;
    }
  }, [content, scrollToBottom]);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;

    const resizeObserver = new ResizeObserver(() => {
      if (scrollRef.current && checkIsAtBottom(scrollRef.current)) {
        scrollToBottom(true);
      }
    });

    resizeObserver.observe(element);
    if (contentRef.current) {
      resizeObserver.observe(contentRef.current);
    }
    return () => resizeObserver.disconnect();
  }, [scrollToBottom, checkIsAtBottom]);

  const disableAutoScroll = useCallback(() => {
    const atBottom = scrollRef.current
      ? checkIsAtBottom(scrollRef.current)
      : false;

    // Only disable if not at bottom
    if (!atBottom) {
      userHasScrolled.current = true;
      autoScrollEnabled.current = false;
    }
  }, [checkIsAtBottom]);

  return {
    scrollRef,
    contentRef,
    isAtBottom,
    scrollToBottom: () => scrollToBottom(false),
    disableAutoScroll,
  };
}
