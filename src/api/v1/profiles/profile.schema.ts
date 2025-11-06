import { z } from 'zod';

export const profileSchema = z
  .object({
    tangible: z.boolean(),
    visible: z.boolean(),
  })
  .partial();

export type ValidProfile = z.output<typeof profileSchema>;
