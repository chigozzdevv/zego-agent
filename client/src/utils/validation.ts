import { z } from 'zod'

export const messageSchema = z.object({
  content: z.string().min(1).max(1000),
  type: z.enum(['text', 'voice']),
})

export const sessionSchema = z.object({
  roomId: z.string().min(1),
  userId: z.string().min(1),
})