import { z } from 'zod';

export const pointNumberSchema = z.coerce.number().transform((n) => Math.trunc(n <= 0 ? 0 : n));

export const selectionSchema = z.object({
  selectedPoint: z.object({ x: pointNumberSchema, y: pointNumberSchema }),
  characterName: z.string().trim(),
});

export type Selection = z.output<typeof selectionSchema>;
