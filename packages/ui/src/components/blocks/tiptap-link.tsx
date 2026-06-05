import Link from "@tiptap/extension-link";
import {
  MarkViewContent,
  type MarkViewProps,
  ReactMarkViewRenderer,
} from "@tiptap/react";
import { createContext, useContext } from "react";

/**
 * Renders a link with the given href as a custom element (e.g. a chip) instead
 * of a plain anchor. Return `null`/`undefined` to fall back to the default
 * anchor rendering.
 */
export type TiptapLinkRenderer = (props: {
  href: string;
  children: React.ReactNode;
}) => React.ReactNode;

const TiptapLinkRendererContext = createContext<TiptapLinkRenderer | undefined>(
  undefined,
);

export function TiptapLinkRendererProvider({
  renderLink,
  children,
}: {
  renderLink: TiptapLinkRenderer;
  children: React.ReactNode;
}) {
  return (
    <TiptapLinkRendererContext.Provider value={renderLink}>
      {children}
    </TiptapLinkRendererContext.Provider>
  );
}

function LinkMarkView({ mark }: MarkViewProps) {
  const renderLink = useContext(TiptapLinkRendererContext);
  const href = (mark.attrs.href as string | null | undefined) ?? "";

  const rendered = renderLink?.({
    href,
    children: <MarkViewContent />,
  });

  if (rendered != null && rendered !== false) {
    // Custom rendering (e.g. a chip) replaces the link entirely. Keep it out of
    // the editable flow so the chip behaves as an atomic inline element.
    return (
      <span
        contentEditable={false}
        data-tiptap-link-chip=""
        className="contents"
      >
        {rendered}
      </span>
    );
  }

  return (
    <a href={href} target="_blank" rel="noreferrer">
      <MarkViewContent />
    </a>
  );
}

/**
 * Drop-in replacement for the StarterKit `link` mark that renders links through
 * the {@link TiptapLinkRendererProvider} context, allowing the host app to swap
 * specific links (thread references, GitHub PRs, …) for rich chips.
 */
export const LinkExtension = Link.extend({
  addMarkView() {
    return ReactMarkViewRenderer(LinkMarkView);
  },
}).configure({
  openOnClick: false,
});
