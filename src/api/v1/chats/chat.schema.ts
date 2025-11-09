import { z } from 'zod';

export const messageSchema = z.string().trim().nonempty();

export const chatSchema = z.object({
  profiles: z.array(z.string().trim().uuid()).nonempty(),
  message: messageSchema,
});

export type ValidChat = z.output<typeof chatSchema>;
