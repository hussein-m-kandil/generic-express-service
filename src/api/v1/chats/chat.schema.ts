import { z } from 'zod';

export const messageBodySchema = z.string().trim().nonempty();

export const messageSchema = z.object({ body: messageBodySchema });

export type ValidMessage = z.output<typeof messageSchema>;

export const chatSchema = z.object({
  profiles: z.array(z.string().trim().uuid()).nonempty(),
  message: messageBodySchema,
});

export type ValidChat = z.output<typeof chatSchema>;
