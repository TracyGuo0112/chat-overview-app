import z from 'zod'
import { createFileRoute } from '@tanstack/react-router'
import { ConversationDetailPage } from '@/features/dashboard/conversation-detail'

const detailSearchSchema = z.object({
  customerId: z.string().optional().catch(''),
})

function RouteComponent() {
  const { conversationId } = Route.useParams()
  const { customerId } = Route.useSearch()
  return (
    <ConversationDetailPage
      conversationId={conversationId}
      customerIdFilter={customerId}
    />
  )
}

export const Route = createFileRoute(
  '/_authenticated/conversations/$conversationId'
)({
  validateSearch: detailSearchSchema,
  component: RouteComponent,
})
