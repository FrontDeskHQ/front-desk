import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute(
  '/app/_workspace/settings/organization/integration/$slug',
)({
  component: RouteComponent,
})

function RouteComponent() {
  return (
    <div>Hello "/app/_workspace/settings/organization/integration/$slug"!</div>
  )
}
