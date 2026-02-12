import { createFileRoute } from '@tanstack/react-router'
import { MembershipOps } from '@/features/membership-ops'

export const Route = createFileRoute('/_authenticated/membership-ops/')({
  component: MembershipOps,
})
