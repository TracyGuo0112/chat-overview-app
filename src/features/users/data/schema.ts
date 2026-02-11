import { z } from 'zod'

const userStatusSchema = z.union([
  z.literal('active'),
  z.literal('inactive'),
  z.literal('invited'),
  z.literal('suspended'),
])
export type UserStatus = z.infer<typeof userStatusSchema>

const userRoleSchema = z.union([
  z.literal('superadmin'),
  z.literal('admin'),
  z.literal('cashier'),
  z.literal('manager'),
])

const subscriptionStatusSchema = z.union([
  z.literal('免费版'),
  z.literal('微光版'),
  z.literal('烛照版'),
  z.literal('洞见版'),
])

const subscriptionExpiredSchema = z.union([
  z.literal('已用完'),
  z.literal('未用完'),
  z.literal('未过期'),
  z.literal('已过期'),
])

const genderSchema = z.union([z.literal('男'), z.literal('女'), z.literal('-')])

const userSchema = z.object({
  id: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  username: z.string(),
  nickname: z.string().optional(),
  email: z.string(),
  phoneNumber: z.string(),
  status: userStatusSchema,
  role: userRoleSchema,
  gender: genderSchema.optional(),
  userAge: z.number().int().min(0).max(120).nullable().optional(),
  subscriptionStatus: subscriptionStatusSchema.optional(),
  subscriptionExpired: subscriptionExpiredSchema.optional(),
  latestConversationId: z.string().nullable().optional(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
})
export type User = z.infer<typeof userSchema>

export const userListSchema = z.array(userSchema)
