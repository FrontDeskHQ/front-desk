---
name: product-mock
description: Build pixel-perfect mocks of real FrontDesk screens for marketing pages, and refresh existing mocks that have drifted from the app. Use when the user wants a product visual, screenshot-like mock, app preview, or demo UI on the landing page; wants a marketing section to show the inbox/thread/portal/settings; or asks whether a landing-page mock is still accurate, out of date, or has drifted.
---

# Product mocks for marketing

A marketing mock is a **mirror**: a static reproduction of a real FrontDesk screen, built from the same components the app itself renders, showing a plausible moment of use.

Two failure modes it exists to prevent:

- **Reimplementation** — hand-rolled divs that approximate the app. They look wrong immediately and wrong forever.
- **Drift** — the app moves, the mirror doesn't, and the marketing page advertises a product that no longer exists. Cured by **pins**: the commit hash of every source file a mirror was built from, recorded in the file.

Mocks live under `apps/web/src/components/landing-page/`. Read `apps/web/src/components/landing-page/DESIGN_SPEC.md` before laying anything out — it owns the page grid, type scale, and full-bleed exceptions, and this skill does not restate it.

## Branch A — build a new mirror

### 1. Find the source

Locate the real screen in `apps/web/src/routes/app/` or `apps/web/src/routes/support/` and walk its tree down to the leaf components and `@workspace/ui` primitives it renders.

Then sort every file in that tree by [the reuse ladder](#the-reuse-ladder) — **reuse**, **fork**, or **rebuild**. The default is reuse; a file only falls to the next rung for the stated reason, and you must be able to say what that reason is.

Done when every file in the tree has a rung and every non-reused file has a one-line justification.

### 2. Pin the forks

Only **forked** and **rebuilt** files carry pins — reused ones move with the app and cannot drift. For each:

```bash
git log -1 --format=%h -- <path>
```

Done when every forked and rebuilt path has a hash, and no reused path does.

### 3. Choose the state

A mirror shows a **realistic moment**, never an empty state, never a flawless one. Real inboxes have mixed priorities, unassigned threads, stale timestamps, one thing visibly on fire. Names and content should read like the seeded fixtures (`fd-seed`), not like placeholders — no Lorem, no "User 1", no `example.com`.

If the request does not pin down what moment to show, ask the user with `AskUserQuestion`: which screen, what is happening in it, and which detail the surrounding copy needs the eye to land on.

Done when you can state the scenario in one sentence before writing any JSX.

### 4. Mirror it

- Import every **reused** file directly from where the app keeps it. Never copy a component you could have imported.
- In every **forked** file, copy `className` strings from the real component **verbatim**. A changed spacing value is drift you authored yourself.
- Replace only the data layer: live-state queries and hooks become static props fed from a local `data.ts`, typed by a local `types.ts`.
- Make it **inert** — see [Inert by default](#inert-by-default). No handlers, no routing. Simulated hover/focus is a prop (`isSimulatedHover`), not real state.
- Anything the mock adds that the app does not have (motion variants, cropping, a fake cursor) is a **marketing layer**, kept in its own file, never mixed into a mirrored component.

Done when the mock's JSX structure matches the real component's, node for node, apart from the data layer and marketing layer.

### 5. Write the mirror header

Every file that mirrors real UI opens with one:

```tsx
/* mirror: thread list — apps/web/src/routes/app/_workspace/_main/threads/index.tsx
 * fork: apps/web/src/components/threads/thread-list.tsx @ a1b2c3d
 *   why: reads the thread collection from live-state
 * reuse: thread-row.tsx, LabelBadge, StatusIndicator, Avatar
 * state: 5 open threads, mixed priority, one unassigned and 3 days stale
 * marketing: staggered blur-slide entrance; simulated hover on row 2
 */
```

`fork` carries the pins and the coupling that forced each one. `reuse` is names only, no paths and no pins — it exists so a reader can see how much of the mirror is the real product, and so a later fork of a reused component is visible as a change.

One header per file. A file that mirrors two distinct screen regions is two files.

Done when every mirrored file has a header whose `fork` list matches the pins from step 2 exactly, every `fork` entry has a `why`, and `git status` shows no mirrored file without a header.

### 6. Verify

Run the app (`bun dev`), open the real screen and the marketing page, and compare them at the same width. Check the responsive breakpoints the real component declares.

Then Tab through the marketing page from the top: focus must skip the mirror entirely and land on the next real link or button, and the cursor must not change shape anywhere over it.

Done when you can name every visual difference between mirror and source and justify each as a deliberate marketing-layer choice, and the Tab pass reaches no mirrored element the user did not explicitly ask to be interactive.

## Branch B — check for drift

Run when the user asks whether a mock is current, or before shipping a landing-page change.

1. Collect every `fork:` pin from the mirror headers under `apps/web/src/components/landing-page/`. Reused components need no check — they are the app.
2. For each, diff the source forward:

   ```bash
   git log --oneline <hash>..HEAD -- <path>
   git diff <hash>..HEAD -- <path>
   ```

3. Classify each changed path: **visual** (structure, classes, tokens, new elements) or **non-visual** (types, imports, handlers, data plumbing).
4. Apply visual changes to the mirror by hand — porting the diff, not rebuilding the file.
5. Re-pin every path you diffed to the current hash, including the non-visual ones. An unchanged mirror with a fresh pin is the correct outcome when a diff was non-visual.

6. Check each fork's `why` still holds. Couplings get removed — when the reason a file was forked is gone, delete the fork, import the real component, and move it to the header's `reuse` line. A drift check that retires a fork is the best possible outcome.

Report as a table: path, commits since pin, visual or not, action taken.

Done when every pin in the tree resolves to a commit that is an ancestor of `HEAD` with no unreviewed visual diff behind it.

## The reuse ladder

Every file in the real screen's tree lands on one of three rungs. Start at the top and only fall when the rung above is genuinely impossible — a mock built mostly from rung 1 is the goal, because **a reused component cannot drift**. Every fall costs a pin and a future diff to review.

**1. Reuse — import the real component.** `@workspace/ui` primitives (`Sidebar`, `Avatar`, `LabelBadge`, `StatusIndicator`, `Button`) and any app component that takes its data as props. Most presentational components qualify. Prop-drilled fixture data is not a reason to fork.

**2. Fork — copy the file into the mock tree.** Only when the component reaches for something the marketing page cannot give it: a live-state query or hook, router context, auth or org context, a portal/dialog that must actually open. Fork the smallest unit that removes the coupling — if a page component is coupled but its row component is not, fork the page and reuse the row. Change nothing but the coupled lines; a fork that also restyles is a rebuild pretending otherwise.

**3. Rebuild — write it from scratch.** Only for UI the product does not have: the marketing layer, a device frame, a cropped viewport, an animated cursor. If you are rebuilding something the app renders, you have made an error on rung 2.

If a component is one small change away from being reusable — a prop instead of a hook — say so and offer it as a `ui-component` or app-side refactor. Do not make that change unasked, and do not fork silently to avoid asking.

Done-check for any mock: for each forked file, a sentence naming the exact coupling that forced it.

## Inert by default

A mirror is a picture of the product, not the product. By default it is **inert**: nothing in it responds to a mouse, nothing in it can be reached by Tab, and a screen reader sees one labelled image rather than a fake app to explore.

Wrap every mirror root:

```tsx
<div role="img" aria-label="The FrontDesk inbox, showing five open threads">
  <div inert className="pointer-events-none select-none">
    {/* mirror */}
  </div>
</div>
```

`inert` removes the whole subtree from tab order and the accessibility tree; `pointer-events-none` kills hover and click. Both, not one — `inert` alone still lets the cursor change over a mirrored button. A **reused** component that renders a real `<button>` is fine — `inert` neutralises it, which is part of why reuse is the default. In a **forked** file, render interactive primitives as `<div>` (via `asChild`) and never carry over an `href` or a handler.

Because the subtree is hidden from assistive tech, the `aria-label` on the wrapper is the only description a screen-reader user gets. Write it as a sentence about what the screen shows, not a component name.

### When a mock is interactive

The user can override this for a section, a single element, or a whole mock — a tab bar that switches views, a hoverable row, a play/pause control on an animated sequence. Only ever on request, never on your own judgement that it "would be nicer".

An interactive mirror is **still a mock**. The interactive part becomes a real focusable control with a real label; everything around it stays inert. It may switch between prepared states in local `useState` and nothing else — no navigation, no network, no persistence, no live-state, no writes. A control that appears to do something the product does must do it locally against `data.ts` or not appear to do it at all.

Record it in the mirror header's `marketing:` line: which element is live, and what it switches between.

## Rules

- Never screenshot the app and ship an image. A mirror is code, or it cannot be checked for drift.
- Never edit a real app component unasked, even to make it reusable. Propose it; a primitive variant is a `ui-component` task first.
- Fixture data lives in `data.ts` next to the mock, never inline in JSX — it is the thing most often rewritten and must be editable without touching layout.
- Update `DESIGN_SPEC.md` in the same commit whenever a mock changes the page's structure or grid usage.
