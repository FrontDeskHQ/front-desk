import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/app/_workspace/_main/threads/trash/$id')(
  {
    component: RouteComponent,
  },
)

function RouteComponent() {
  return <div>Hello "/app/_workspace/_main/threads/trash/$id"!</div>
}
