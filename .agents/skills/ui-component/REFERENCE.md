# Component authoring conventions

Primitives live in `packages/ui/src/components/<name>.tsx` and are consumed as `@workspace/ui/components/<name>`. Mirror the existing components — `button.tsx`, `badge.tsx`, and `card.tsx` are the references.

## Philosophy (shadcn, FrontDesk flavor)

- **Own the code.** Components are copied into the repo and edited freely, not imported from a black-box library. Optimize for being read and forked.
- **Primitive + cva.** A headless primitive (behavior/a11y) styled with a `class-variance-authority` config (look). Keep the two separable.
- **Composition over config.** Prefer compound sub-components and `render` / `asChild` slots over boolean prop explosions. See **Composability** below — it is non-negotiable, not a preference.
- **Unstyled escape hatch.** Always forward `className` through `cn()` last so callers can override. Spread remaining props onto the root element.

## Composability (enforced)

A component that can only be used one way is a bug. Default to a small set of composable parts the caller arranges, not one monolith with flags. `card.tsx` (parts), `button.tsx` (`render` slot) and `composite.tsx` (context-bound parts + `useRender`) are the references.

Rules:

- **Split anything with internal structure into parts.** If a component renders distinct regions (header/body/footer, trigger/content, label/control), expose them as named sub-components (`Card` + `CardHeader` + `CardContent`) instead of `title` / `footer` / `icon` content props. Slots beat props for anything that can hold arbitrary children.
- **No boolean/content-prop explosion.** More than ~2 booleans that toggle layout, or props like `leftIcon` / `rightContent` / `showFooter`, is the signal to switch to sub-components or `children`. Variants (`cva`) are for _style_; structure belongs in composition.
- **Always allow element substitution.** Every interactive/leaf primitive must accept Base UI's `render` prop (forward it to the underlying `@base-ui/react` primitive, or implement it with `useRender`) so callers can swap the element (render a `Button` as a `Link`, a trigger as a custom node) without losing styles or behavior. Never `asChild`/`Slot`.
- **Pass-through, don't intercept.** Forward `className` (through `cn()`, last), `ref`, and `...props` to the real DOM node on every part. Never swallow `onClick`, `aria-*`, `data-*`, or `style`.
- **Share state via context, not prop drilling.** Compound components coordinate through a small internal React context (see `composite.tsx`), so parts work in any arrangement and nesting depth — don't require a fixed child order or `React.Children` inspection.
- **Keep parts independently usable.** A `CardHeader` should render on its own; parts must not crash when used outside an unrelated sibling. Only _require_ a provider when shared state genuinely demands it (then guard with a clear error).
- **Composition limits live in docs, not code.** If two parts shouldn't combine, say so in the docs page Anatomy/guidance — don't add a prop to prevent it.

When a request implies many configurations, reach for the `vercel-composition-patterns` skill before adding props.

## Mechanics

- **Base layer — Base UI only:** new components build on `@base-ui/react` (e.g. `Button as BaseButton`). For a from-scratch element with no matching primitive, use the `useRender` hook from `@base-ui/react/use-render` (see `composite.tsx`). **Do not add `@radix-ui/*` or `Slot`/`asChild`** — some existing components still use Radix; do not copy that into new ones.
- **`data-slot`:** every rendered element gets a `data-slot="<name>"` attribute (`"button"`, `"card-header"`). Used for styling hooks and querying.
- **Variants:** declare with `cva`; export both the component and its `xVariants` function (`export { Button, buttonVariants }`). Provide `defaultVariants`.
- **Types:** `React.ComponentProps<"el">` (or `<typeof BasePrimitive>`) intersected with `VariantProps<typeof xVariants>`. For element substitution use `useRender.ComponentProps<"el">` (it adds the `render` prop) and return `useRender({ defaultTagName, render, props })`.
- **Refs:** use `React.forwardRef` for focusable/interactive components (see `button.tsx`); simple containers can be plain functions (see `card.tsx`).
- **Icons:** `lucide-react`. Size via `[&_svg]:size-4` style rules in the cva base, not per-icon.

## Brand & styling tokens

Style with semantic tokens from `packages/ui/src/styles/globals.css`, never ad-hoc colors. The palette is generated (the "chromaflow") — these layer correctly in light and dark:

- Surfaces: `bg-background-primary` (base) → `-secondary` → `-tertiary` → `-quaternary` (each step lighter/recessed). Cards sit on `-secondary`, headers/insets on `-tertiary`.
- Text: `text-foreground-primary` (strongest) → `-secondary` → `-tertiary`.
- Borders: `border` / `border-border-primary`; dashed for doc/demo chrome.
- Focus / invalid: `focus-visible:ring-ring/50 focus-visible:ring-[3px]`, `aria-invalid:border-destructive aria-invalid:ring-destructive/20`.
- Status accents: emerald (success), amber (warning), red (destructive) — follow the `badge.tsx` light/dark pairs (`bg-emerald-100 ... dark:bg-emerald-500/10`).
- The one sanctioned literal is the primary brand blue `#345BCA` (see the button `primary` variant). Don't introduce other raw hex values.
- Radii: `rounded-sm`/`rounded-md` per size; the global `--radius` is `0.625rem`.

## Accessibility

- Keyboard operable; visible focus ring (handled by the focus tokens above).
- Icon-only controls need `aria-label` (and ideally a tooltip).
- Use `aria-invalid`, `aria-disabled`, `sr-only` text for non-visual context (see the button's external-link "(opens in new window)" pattern).

## Don'ts

- No raw hex (except `#345BCA`); no hard-coded light/dark colors that skip the tokens.
- Don't break the variant API with one-off `className` overrides in the component itself — expose a variant instead.
- Don't add tests unless the user asks.
