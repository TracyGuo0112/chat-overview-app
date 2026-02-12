import { createFileRoute } from '@tanstack/react-router'
import { DataChat } from '@/features/data-chat'

export const Route = createFileRoute('/_authenticated/tasks/')({
  component: DataChat,
})
