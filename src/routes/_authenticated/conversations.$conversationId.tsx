import { createFileRoute } from '@tanstack/react-router'
import { ConversationDetailPage } from '@/features/dashboard/conversation-detail'

function RouteComponent() {
  const { conversationId } = Route.useParams()
  return <ConversationDetailPage conversationId={conversationId} />
}

export const Route = createFileRoute(
  '/_authenticated/conversations/$conversationId'
)({
  component: RouteComponent,
})
