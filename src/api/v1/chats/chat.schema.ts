import * as Image from '@/lib/image';
import { z } from 'zod';

const messageFields = { imagedata: Image.imageSchema.optional(), body: z.string().trim() };

export const messageSchema = z.object({ ...messageFields, body: messageFields.body.nonempty() });

export type ValidMessage = z.output<typeof messageSchema>;

export const optionalMessageSchema = z
  .object({
    ...messageFields,
    body: messageFields.body.optional(),
  })
  .transform((data) => {
    const body = data.body ?? '';
    return { ...data, body };
  });

export type ValidOptionalMessage = z.output<typeof optionalMessageSchema>;

const chatFields = { profiles: z.array(z.string().trim().uuid()), message: messageSchema };

export const chatSchema = z.object(chatFields);

export type ValidChat = z.output<typeof chatSchema>;

export const chatWithOptionalMessageSchema = z
  .object({
    ...chatFields,
    message: optionalMessageSchema.optional(),
  })
  .transform((data): ValidChat => {
    const body = data.message?.body ?? '';
    const message = data.message ? { ...data.message, body } : { body };
    return { ...data, message };
  });

export type ValidOptionalChat = z.output<typeof chatWithOptionalMessageSchema>;
