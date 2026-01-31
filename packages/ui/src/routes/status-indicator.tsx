import {
  StatusIndicator,
  StatusText,
  statusValues,
} from "@/components/indicator";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/status-indicator")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <div className="flex flex-col gap-8">
      <div className="text-lg">Status Indicator</div>
      <div className="flex flex-col gap-4">
        <div className="text-sm">All Status Values</div>
        <div className="border rounded-md p-4 grid grid-cols-4 border-dashed gap-4">
          {Object.entries(statusValues).map(([key, value]) => {
            const status = Number(key);
            return (
              <div
                key={key}
                className="flex flex-col items-center justify-center gap-2"
              >
                <StatusIndicator status={status} />
                <div className="text-xs text-foreground-secondary">
                  {value.label}
                </div>
                <div className="text-xs text-foreground-tertiary">
                  Status: {status}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="flex flex-col gap-4">
        <div className="text-sm">With StatusText Component</div>
        <div className="border rounded-md p-4 flex flex-col gap-4 border-dashed">
          {Object.entries(statusValues).map(([key]) => {
            const status = Number(key);
            return (
              <div key={key} className="flex items-center gap-3">
                <StatusIndicator status={status} />
                <StatusText status={status} />
                <span className="text-xs text-foreground-tertiary">
                  (status: {status})
                </span>
              </div>
            );
          })}
        </div>
      </div>
      <div className="flex flex-col gap-4">
        <div className="text-sm">Different Sizes (with className)</div>
        <div className="border rounded-md p-4 flex flex-col gap-4 border-dashed">
          {Object.entries(statusValues).map(([key]) => {
            const status = Number(key);
            return (
              <div key={key} className="flex items-center gap-4">
                <StatusIndicator status={status} className="size-4" />
                <StatusIndicator status={status} className="size-6" />
                <StatusIndicator status={status} className="size-8" />
                <StatusIndicator status={status} className="size-10" />
                <span className="text-xs text-foreground-tertiary ml-2">
                  {statusValues[status].label}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
