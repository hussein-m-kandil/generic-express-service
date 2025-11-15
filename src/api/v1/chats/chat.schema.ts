import * as Image from '@/lib/image';
import { z } from 'zod';

export const messageSchema = z.object({
  imagedata: Image.imageSchema.optional(),
  body: z.string().trim().nonempty(),
});

export type ValidMessage = z.output<typeof messageSchema>;

export const chatSchema = z.object({
  profiles: z.array(z.string().trim().uuid()).nonempty(),
  message: messageSchema,
});

export type ValidChat = z.output<typeof chatSchema>;
