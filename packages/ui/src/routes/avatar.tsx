import { Avatar } from "@/components/avatar";
import { createFileRoute } from "@tanstack/react-router";

const avatarNames = [
  "Pedro Costa",
  "Anna Smith",
  "Liam Johnson",
  "Maya Patel",
  "Diego Alvarez",
  "Sofia Rossi",
  "Noah Chen",
  "Olivia Brown",
];

export const Route = createFileRoute(
  // biome-ignore lint/suspicious/noExplicitAny: route tree is generated after adding new route files
  "/avatar" as any,
)({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <div className="flex flex-col gap-8">
      <div className="text-lg">Avatar</div>

      <div className="flex flex-col gap-4">
        <div className="text-sm">Single-character fallback (all sizes)</div>
        <div className="border rounded-md p-4 border-dashed flex items-center gap-4 flex-wrap">
          <Avatar fallback="Pedro Costa" size="sm" />
          <Avatar fallback="Pedro Costa" size="md" />
          <Avatar fallback="Pedro Costa" size="lg" />
          <Avatar fallback="Pedro Costa" size="xl" />
          <Avatar fallback="Pedro Costa" size="xxl" />
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <div className="text-sm">Deterministic color palette (hashed)</div>
        <div className="border rounded-md p-4 border-dashed grid grid-cols-2 md:grid-cols-4 gap-4">
          {avatarNames.map((name) => (
            <div key={name} className="flex items-center gap-3">
              <Avatar fallback={name} size="lg" />
              <div className="text-sm text-foreground-secondary">{name}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <div className="text-sm">Organizations variant</div>
        <div className="border rounded-md p-4 border-dashed flex items-center gap-4 flex-wrap">
          <Avatar fallback="FrontDesk" variant="org" size="md" />
          <Avatar fallback="Acme Corp" variant="org" size="lg" />
          <Avatar fallback="Support Team" variant="org" size="xl" />
        </div>
      </div>
    </div>
  );
}
