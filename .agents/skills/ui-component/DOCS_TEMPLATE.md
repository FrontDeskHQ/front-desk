# Docs page format

Every primitive gets one route page in the FrontDesk UI Studio
(`packages/ui/src/routes/<name>.tsx`). Pages are built from the doc kit
(`routes/-components/doc-kit.tsx`) so they read consistently and stay parseable
by agents. Use `templates/docs-page.tsx` as the starting point.

## Required structure, in order

1. **`meta` export** (`ComponentMeta`) — FIRST export in the file. The
   machine-readable contract. An agent should understand the component from
   `meta` alone, without reading JSX. Keep every field filled:
   - `name`, `status` (`stable` | `beta` | `deprecated`), `description`
   - `import` — the exact copy-paste import line
   - `whenToUse` / `whenNotToUse` — concrete situations, not platitudes. Name
     the alternative component in `whenNotToUse` ("use Badge instead").
   - `related` — sibling components for cross-linking
2. **`<DocPage meta={meta}>`** — renders the header (name, status badge,
   description, import, when-to-use/not, related) from `meta`. Wraps the body.
3. **Demo sections** — one `<DocSection>` per axis of variation
   (Variants, Sizes, States, plus component-specific ones like Icons). Each
   contains one or more `<Demo code={...}>`:
   - Children render the live example.
   - `code` is the **exact JSX** that produces it — this is the copy-paste
     snippet. Keep it in sync with the children; they must not drift.
4. **API section** — `<PropsTable rows={...}>`. List props *in addition to* the
   native element props. Mirror the component's real `cva` variants and props
   (name, type, default, description). Types as string literals, e.g.
   `"sm" | "md" | "lg"`.
5. **Anatomy section** — `<Anatomy code={...}>`, **compound components only**
   (Card, Dialog, etc.). Shows the sub-component tree and slots. Delete for
   single-element components.

## Rules

- Order is fixed: meta → DocPage → Demos → API → Anatomy. Predictable layout is
  what makes pages scannable for both humans and agents.
- Never inline styling primitives by hand (no raw dashed-border boxes). Use
  `DocSection` / `Demo` so spacing and chrome stay uniform.
- Demos use real, representative content — actual labels and copy, not "lorem".
- Show edge states that have real guidance attached (disabled, invalid,
  loading, empty), not every theoretical combination.
- The `"/thing" as any` cast on `createFileRoute` is expected until the route
  tree regenerates (the dev server / build regenerates `routeTree.gen.ts`).
  Leave the biome-ignore comment in place.

## Registering the page

After creating the route, add a link in `routes/-components/sidebar.tsx` under
the **Components** `SidebarGroup`, following the existing `SidebarMenuItem`
pattern (set `data-active` to `matches.at(-1)?.pathname === "/thing"` and
`<Link to="/thing">`). Pages are invisible in the Studio nav until linked.
