import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/support/$slug/threads/$id')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/support/$slug/threads/$id"!</div>
}
