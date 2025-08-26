import * as Image from '@/lib/image';
import { z } from 'zod';

export const imageSchema = Image.imageSchema.merge(
  z.object({
    isAvatar: z.preprocess(
      (v) => [true, 'true', 'on'].includes(v as string | boolean),
      z.boolean().optional().default(false)
    ),
  })
);
