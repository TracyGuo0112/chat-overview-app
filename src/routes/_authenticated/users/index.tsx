import z from 'zod'
import { createFileRoute } from '@tanstack/react-router'
import { Users } from '@/features/users'

const usersSearchSchema = z.object({
  page: z.number().optional().catch(1),
  pageSize: z.number().optional().catch(10),
  funnelSegment: z
    .union([
      z.literal('registered'),
      z.literal('firstConversation'),
      z.literal('subscribed'),
      z.literal('renewed'),
    ])
    .optional()
    .catch(undefined),
  startDate: z.string().optional().catch(''),
  endDate: z.string().optional().catch(''),
  // Facet filters
  subscriptionStatus: z
    .array(
      z.union([
        z.literal('免费版'),
        z.literal('微光版'),
        z.literal('烛照版'),
        z.literal('洞见版'),
      ])
    )
    .optional()
    .catch([]),
  subscriptionExpired: z
    .array(
      z.union([
        z.literal('已用完'),
        z.literal('未用完'),
        z.literal('未过期'),
        z.literal('已过期'),
      ])
    )
    .optional()
    .catch([]),
  // Per-column text filter
  nickname: z.string().optional().catch(''),
})

export const Route = createFileRoute('/_authenticated/users/')({
  validateSearch: usersSearchSchema,
  component: Users,
})
