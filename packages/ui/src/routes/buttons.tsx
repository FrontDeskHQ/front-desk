import { Button } from "@/components/button";
import { createFileRoute } from "@tanstack/react-router";
import { Plus } from "lucide-react";

export const Route = createFileRoute("/buttons")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <div className="flex flex-col gap-8">
      <div className="text-lg">Buttons</div>
      <div className="flex flex-col gap-4">
        <div className="text-sm">Variants and sizes</div>
        <div className="border rounded-md p-4 grid grid-cols-6 border-dashed gap-4">
          <div className="flex items-center justify-center text-foreground-secondary text-sm">
            sm
          </div>
          <div className="flex items-center justify-center">
            <Button size="sm">Default</Button>
          </div>
          <div className="flex items-center justify-center">
            <Button variant="outline" size="sm">
              Outline
            </Button>
          </div>
          <div className="flex items-center justify-center">
            <Button variant="secondary" size="sm">
              Secondary
            </Button>
          </div>
          <div className="flex items-center justify-center">
            <Button variant="ghost" size="sm">
              Ghost
            </Button>
          </div>
          <div className="flex items-center justify-center">
            <Button variant="link" size="sm">
              Link
            </Button>
          </div>
          <div className="col-span-full border-t border-dashed h-px" />
          <div className="flex items-center justify-center text-foreground-secondary text-sm">
            md (default)
          </div>
          <div className="flex items-center justify-center">
            <Button>Default</Button>
          </div>
          <div className="flex items-center justify-center">
            <Button variant="outline">Outline</Button>
          </div>
          <div className="flex items-center justify-center">
            <Button variant="secondary">Secondary</Button>
          </div>
          <div className="flex items-center justify-center">
            <Button variant="ghost">Ghost</Button>
          </div>
          <div className="flex items-center justify-center">
            <Button variant="link">Link</Button>
          </div>
          <div className="col-span-full border-t border-dashed h-px" />
          <div className="flex items-center justify-center text-foreground-secondary text-sm">
            lg
          </div>
          <div className="flex items-center justify-center">
            <Button size="lg">Default</Button>
          </div>
          <div className="flex items-center justify-center">
            <Button variant="outline" size="lg">
              Outline
            </Button>
          </div>
          <div className="flex items-center justify-center">
            <Button variant="secondary" size="lg">
              Secondary
            </Button>
          </div>
          <div className="flex items-center justify-center">
            <Button variant="ghost" size="lg">
              Ghost
            </Button>
          </div>
          <div className="flex items-center justify-center">
            <Button variant="link" size="lg">
              Link
            </Button>
          </div>
          <div className="col-span-full border-t border-dashed h-px" />
          <div className="flex items-center justify-center text-foreground-secondary text-sm">
            xl
          </div>
          <div className="flex items-center justify-center">
            <Button size="xl">Default</Button>
          </div>
          <div className="flex items-center justify-center">
            <Button variant="outline" size="xl">
              Outline
            </Button>
          </div>
          <div className="flex items-center justify-center">
            <Button variant="secondary" size="xl">
              Secondary
            </Button>
          </div>
          <div className="flex items-center justify-center">
            <Button variant="ghost" size="xl">
              Ghost
            </Button>
          </div>
          <div className="flex items-center justify-center">
            <Button variant="link" size="xl">
              Link
            </Button>
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-4">
        <div className="text-sm">Icons</div>
        <div className="border rounded-md p-4 grid grid-cols-6 border-dashed gap-4">
          <div className="flex items-center justify-center text-foreground-secondary text-sm">
            Leading icons
          </div>
          <div className="flex items-center justify-center">
            <Button>
              <Plus />
              Default
            </Button>
          </div>
          <div className="flex items-center justify-center">
            <Button variant="outline">
              <Plus />
              Outline
            </Button>
          </div>
          <div className="flex items-center justify-center">
            <Button variant="secondary">
              <Plus />
              Secondary
            </Button>
          </div>
          <div className="flex items-center justify-center">
            <Button variant="ghost">
              <Plus />
              Ghost
            </Button>
          </div>
          <div className="flex items-center justify-center">
            <Button variant="link">
              <Plus />
              Link
            </Button>
          </div>
          <div className="col-span-full border-t border-dashed h-px" />
          <div className="flex items-center justify-center text-foreground-secondary text-sm">
            Trailing icons
          </div>
          <div className="flex items-center justify-center">
            <Button>
              Default
              <Plus />
            </Button>
          </div>
          <div className="flex items-center justify-center">
            <Button variant="outline">
              <Plus />
              Outline
            </Button>
          </div>
          <div className="flex items-center justify-center">
            <Button variant="secondary">
              <Plus />
              Secondary
            </Button>
          </div>
          <div className="flex items-center justify-center">
            <Button variant="ghost">
              <Plus />
              Ghost
            </Button>
          </div>
          <div className="flex items-center justify-center">
            <Button variant="link">
              <Plus />
              Link
            </Button>
          </div>
          <div className="col-span-full border-t border-dashed h-px" />
          <div className="flex items-center justify-center text-foreground-secondary text-sm">
            Icon only
          </div>
          <div className="flex items-center justify-center">
            <Button size="icon">
              <Plus />
            </Button>
          </div>
          <div className="flex items-center justify-center">
            <Button variant="outline" size="icon">
              <Plus />
            </Button>
          </div>
          <div className="flex items-center justify-center">
            <Button variant="secondary" size="icon">
              <Plus />
            </Button>
          </div>
          <div className="flex items-center justify-center">
            <Button variant="ghost" size="icon">
              <Plus />
            </Button>
          </div>
          <div className="flex items-center justify-center">
            <Button variant="link" size="icon">
              <Plus />
            </Button>
          </div>
          <div className="col-span-full border-t border-dashed h-px" />
          <div className="flex items-center justify-center text-foreground-secondary text-sm">
            Icon only (sm)
          </div>
          <div className="flex items-center justify-center">
            <Button size="icon-sm">
              <Plus />
            </Button>
          </div>
          <div className="flex items-center justify-center">
            <Button variant="outline" size="icon-sm">
              <Plus />
            </Button>
          </div>
          <div className="flex items-center justify-center">
            <Button variant="secondary" size="icon-sm">
              <Plus />
            </Button>
          </div>
          <div className="flex items-center justify-center">
            <Button variant="ghost" size="icon-sm">
              <Plus />
            </Button>
          </div>
          <div className="flex items-center justify-center">
            <Button variant="link" size="icon-sm">
              <Plus />
            </Button>
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-4">
        <div className="text-sm">Special states</div>
        <div className="border rounded-md p-4 grid grid-cols-6 border-dashed gap-4">
          <div className="flex items-center justify-center text-foreground-secondary text-sm">
            Disabled
          </div>
          <div className="flex items-center justify-center">
            <Button disabled>Default</Button>
          </div>
          <div className="flex items-center justify-center">
            <Button variant="outline" disabled>
              Outline
            </Button>
          </div>
          <div className="flex items-center justify-center">
            <Button variant="secondary" disabled>
              Secondary
            </Button>
          </div>
          <div className="flex items-center justify-center">
            <Button variant="ghost" disabled>
              Ghost
            </Button>
          </div>
          <div className="flex items-center justify-center">
            <Button variant="link" disabled>
              Link
            </Button>
          </div>
          <div className="col-span-full border-t border-dashed h-px" />
          <div className="flex items-center justify-center text-foreground-secondary text-sm">
            Invalid
          </div>
          <div className="flex items-center justify-center">
            <Button aria-invalid="true">Default</Button>
          </div>
          <div className="flex items-center justify-center">
            <Button variant="outline" aria-invalid="true">
              Outline
            </Button>
          </div>
          <div className="flex items-center justify-center">
            <Button variant="secondary" aria-invalid="true">
              Secondary
            </Button>
          </div>
          <div className="flex items-center justify-center">
            <Button variant="ghost" aria-invalid="true">
              Ghost
            </Button>
          </div>
          <div className="flex items-center justify-center">
            <Button variant="link" aria-invalid="true">
              Link
            </Button>
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-4">
        <div className="text-lg">Usage Guidelines</div>
        <div className="space-y-6">
          <div className="space-y-3">
            <div className="text-sm font-medium">Overview</div>
            <div className="text-sm  space-y-2">
              <p>
                The{" "}
                <code className="px-1 py-0.5 bg-background-tertiary border font-mono rounded text-xs">
                  Button
                </code>{" "}
                component is a flexible, accessible button element with multiple
                variants and sizes. Use buttons for user actions that trigger
                immediate responses.
              </p>
              <p>
                <code className="px-1 py-0.5 bg-background-tertiary border font-mono rounded text-xs">
                  ActionButton
                </code>{" "}
                provides a quick way to create a button with a tooltip and
                keyboard shortcut, generally used for common actions, like
                adding labels, setting status, etc.
              </p>
            </div>
          </div>

          <div className="space-y-3">
            <div className="text-sm font-medium">Variant usage</div>
            <div className="text-sm  space-y-2">
              <p>Use variants for different types of actions:</p>
              <ul className="text-sm  space-y-1.5 list-disc list-inside">
                <li>
                  primary: for primary actions -{" "}
                  <strong>ONLY ONE PRIMARY ACTION PER SCREEN/DIALOG</strong>
                </li>
                <li>
                  secondary: for secondary actions - use for less important
                  actions
                </li>
                <li>
                  outline: for tertiary actions - actions that we need very
                  little attention to, like auto suggestions, copy to clipboard,
                  etc.
                </li>
                <li>
                  ghost: for subtle actions in toolbars or sidebars - actions
                  that we don't need to draw attention to, like filtering,
                  sorting, adding tags, etc.
                </li>
                <li>
                  link: for navigation or less prominent actions - use for
                  navigation or less prominent actions (like a very small action
                  near a primary action)
                </li>
              </ul>
            </div>
          </div>

          <div className="space-y-3">
            <div className="text-sm font-medium">Size usage</div>
            <div className="text-sm  space-y-2">
              <p>Use sizes for different contexts:</p>
              <ul className="text-sm  space-y-1.5 list-disc list-inside">
                <li>sm: for compact spaces, tables, or dense interfaces</li>
                <li>default (md): for most use cases</li>
                <li>lg: for prominent call-to-action buttons</li>
                <li>icon: for square button for icon-only actions</li>
                <li>
                  icon-sm: for smaller square button for compact icon actions
                </li>
              </ul>
            </div>
          </div>

          <div className="space-y-3">
            <div className="text-sm font-medium">Do's ✓</div>
            <ul className="text-sm  space-y-1.5 list-disc list-inside">
              <li>Use tooltips to provide additional context for the button</li>
              <li>
                Use keyboard shortcuts if that button represents a common action
                - They should be displayed in the tooltip
              </li>
              <li>Always provide descriptive text labels for screen readers</li>
              <li>
                Use{" "}
                <code className="px-1 py-0.5 bg-background-tertiary border font-mono rounded text-xs">
                  disabled
                </code>{" "}
                prop to indicate unavailable actions - avoid hiding actions if
                the user should be aware of them.
              </li>
              <li>
                Use{" "}
                <code className="px-1 py-0.5 bg-background-tertiary border font-mono rounded text-xs">
                  aria-invalid="true"
                </code>{" "}
                for form validation errors
              </li>
              <li>
                Use{" "}
                <code className="px-1 py-0.5 bg-background-tertiary border font-mono rounded text-xs">
                  externalLink
                </code>{" "}
                prop for external links to add visual indicator and
                accessibility text
              </li>
              <li>
                Use{" "}
                <code className="px-1 py-0.5 bg-background-tertiary border font-mono rounded text-xs">
                  render
                </code>{" "}
                prop when you need to render as a different element (e.g., Link)
              </li>
              <li>
                Use leading icons to add visual context to the purpose of the
                button and trailing icons to signal the button has an side
                effect (e.g. navigation, download, etc).
              </li>
            </ul>
          </div>

          <div className="space-y-3">
            <div className="text-sm font-medium">Don'ts ✗</div>
            <ul className="text-sm  space-y-1.5 list-disc list-inside">
              <li>
                Do not use pure buttons as links - Use a{" "}
                <code className="px-1 py-0.5 bg-background-tertiary border font-mono rounded text-xs">
                  Link
                </code>{" "}
                or{" "}
                <code className="px-1 py-0.5 bg-background-tertiary border font-mono rounded text-xs">
                  a
                </code>{" "}
                compoennts with the{" "}
                <code className="px-1 py-0.5 bg-background-tertiary border font-mono rounded text-xs">
                  render
                </code>{" "}
                prop if it's only purpose is to navigate to a different page.
              </li>
              <li>
                Don't use multiple primary buttons in the same view (only one
                primary action per screen)
              </li>
              <li>
                Don't use icon-only buttons without tooltips and/or aria-labels
              </li>
              <li>
                Don't nest interactive elements inside buttons - Use button
                groups instead
              </li>
              <li>
                Don't use buttons for decorative purposes - Use icons or text
                only buttons
              </li>
              <li>
                Don't disable buttons without explaining why (consider tooltips
                or helper text)
              </li>
              <li>
                Don't mix icon sizes - icons automatically size to 16px (size-4)
                unless explicitly sized
              </li>
              <li>
                Avoid overriding button styles with custom classes that break
                the design system
              </li>
              <li>Don't use destructive variant for non-destructive actions</li>
            </ul>
          </div>

          <div className="space-y-3">
            <div className="text-sm font-medium">Accessibility</div>
            <ul className="text-sm space-y-1.5 list-disc list-inside">
              <li>
                Buttons are keyboard accessible by default (Enter and Space
                keys)
              </li>
              <li>
                Focus states are automatically handled with visible ring
                indicators
              </li>
              <li>
                Use{" "}
                <code className="px-1 py-0.5 bg-background rounded text-xs">
                  aria-label
                </code>{" "}
                for icon-only buttons without visible text
              </li>
              <li>
                Use{" "}
                <code className="px-1 py-0.5 bg-background rounded text-xs">
                  aria-invalid="true"
                </code>{" "}
                to indicate validation errors
              </li>
              <li>
                Disabled buttons are automatically excluded from keyboard
                navigation
              </li>
              <li>
                External links automatically include "(opens in new window)"
                screen reader text
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
