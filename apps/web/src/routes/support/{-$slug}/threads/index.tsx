import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/support/{-$slug}/threads/')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/support/-$slug/threads/"!</div>
}
