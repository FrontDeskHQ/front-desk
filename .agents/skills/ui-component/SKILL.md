---
name: ui-component
description: Create or edit core UI primitives in the FrontDesk @workspace/ui package (packages/ui/src/components/*.tsx) following the shadcn philosophy and FrontDesk's brand tokens, and author the matching UI Studio docs page. Use when the user wants to add, build, change, or document a shared UI component, design-system primitive, or @workspace/ui component — phrases like "new UI component", "add a <X> component", "edit the button", "update the design system", or "document this component".
---

# UI component & docs

Build and maintain shared UI primitives in `packages/ui` (shadcn-style, owned
in-repo) and their docs pages in the FrontDesk UI Studio. Scope: primitives in
`packages/ui/src/components/*.tsx` — not `blocks/` or app-level components.

Two deliverables, always together: **the component** and **its docs page**. A
component without a docs page is incomplete.

## Before writing

1. Read 2-3 neighboring components to match current conventions — `button.tsx`
   (cva + forwardRef + Base UI), `card.tsx` (compound, `data-slot`),
   `composite.tsx` (context + `useRender`). New components are **Base UI only**
   (`@base-ui/react`) — never add Radix, even where older components use it.
2. Skim [REFERENCE.md](REFERENCE.md) for the styling tokens and rules.
3. For edits: find the component's existing docs route and update it in lockstep.

## Build the component

Start from [templates/component.tsx](templates/component.tsx). Then verify
against [REFERENCE.md](REFERENCE.md):

- [ ] Built on `@base-ui/react` (or `useRender` for a from-scratch element) +
      `cva` variants, with `defaultVariants`. **No Radix / `Slot` / `asChild`.**
- [ ] **Composable, not monolithic** (enforced — see REFERENCE.md): structure
      split into named sub-components/slots, not content props; element
      substitution via the Base UI `render` prop; shared state via context, not
      a fixed child order. If you reach for a 3rd boolean or a `*Content`/`*Icon`
      prop, stop and compose instead.
- [ ] `data-slot` on every rendered element.
- [ ] `className`, `ref`, and `...props` forwarded to the DOM node on every part
      (`className` through `cn()`, last). Nothing intercepted.
- [ ] Styled only with brand tokens (`bg-background-*`, `text-foreground-*`,
      focus/invalid rings). No raw hex except the primary blue `#345BCA`.
- [ ] Exports the component and its `xVariants`.
- [ ] Accessible: keyboard, focus ring, `aria-*`, labels for icon-only.

## Build the docs page

Read [DOCS_TEMPLATE.md](DOCS_TEMPLATE.md) (the format spec) and start from
[templates/docs-page.tsx](templates/docs-page.tsx).

1. **Ensure the doc kit exists.** If `packages/ui/src/routes/-components/doc-kit.tsx`
   is missing, create it from [templates/doc-kit.tsx](templates/doc-kit.tsx).
   Otherwise reuse it.
2. Create `packages/ui/src/routes/<name>.tsx` following the fixed structure:
   `meta` export → `DocPage` → Demo sections → `PropsTable` → `Anatomy`
   (compound only).
   - [ ] `meta` is complete and accurate — an agent can understand the component
         from it alone (status, import, when to use / not, related).
   - [ ] Every `<Demo>` `code` prop is the exact JSX it renders (no drift).
   - [ ] `PropsTable` mirrors the real variants/props.
3. **Register it** in `routes/-components/sidebar.tsx` under the Components group
   (new `SidebarMenuItem`, `data-active` on the pathname, `<Link to="/<name>">`).
   The page is unreachable until linked.

## Finish

- [ ] Typecheck: `bun run --filter @workspace/ui typecheck`. Fix any errors.
- [ ] Summarize what changed (component variants + that the docs page and
      sidebar link were added/updated).

Mention the user can preview at the UI Studio with
`bun run --filter @workspace/ui ui:dev`.
