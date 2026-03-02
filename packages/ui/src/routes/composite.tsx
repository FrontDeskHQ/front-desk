import { Composite, CompositeItem } from "@/components/composite";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute(
  // biome-ignore lint/suspicious/noExplicitAny: route tree is generated after adding new route files
  "/composite" as any,
)({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <div className="flex flex-col gap-8">
      <div className="text-lg">Composite</div>

      <div className="flex flex-col gap-4">
        <div className="text-sm">
          Hover an item to make it active, then keep using arrow keys. Use
          Home/End to jump to first/last enabled item.
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-4">
          <div className="text-sm">Basic vertical list</div>
          <div className="border rounded-md p-4 border-dashed">
            <Composite className="max-w-72">
              <CompositeItem>Inbox</CompositeItem>
              <CompositeItem>Assigned</CompositeItem>
              <CompositeItem>Escalated</CompositeItem>
              <CompositeItem>Closed</CompositeItem>
            </Composite>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <div className="text-sm">Disabled items</div>
          <div className="border rounded-md p-4 border-dashed">
            <Composite className="max-w-72">
              <CompositeItem>Overview</CompositeItem>
              <CompositeItem disabled>Billing (disabled)</CompositeItem>
              <CompositeItem>Integrations</CompositeItem>
              <CompositeItem disabled>Audit log (disabled)</CompositeItem>
              <CompositeItem>Team</CompositeItem>
            </Composite>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <div className="text-sm">Custom render via useRender</div>
          <div className="border rounded-md p-4 border-dashed">
            <Composite orientation="horizontal" className="flex-wrap">
              <CompositeItem
                render={
                  <a
                    href="#custom-render"
                    className="inline-flex items-center rounded-full border px-3 py-1.5"
                  >
                    <span className="sr-only">Custom anchor item</span>
                  </a>
                }
              >
                Custom anchor
              </CompositeItem>
              <CompositeItem
                render={
                  <span className="inline-flex rounded-full border px-3 py-1.5" />
                }
              >
                Custom span
              </CompositeItem>
              <CompositeItem>Default button</CompositeItem>
            </Composite>
          </div>
        </div>
      </div>
    </div>
  );
}
