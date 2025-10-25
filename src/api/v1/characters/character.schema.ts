import { z } from 'zod';

export const pointNumberSchema = z.coerce.number().transform((n) => Math.trunc(n <= 0 ? 0 : n));
export type PointNumber = z.output<typeof pointNumberSchema>;

export const pointSchema = z.object({ x: pointNumberSchema, y: pointNumberSchema });
export type Point = z.output<typeof pointSchema>;

export const characterSelectionSchema = z.record(z.coerce.string().trim(), pointSchema);
export type CharacterSelection = z.output<typeof characterSelectionSchema>;

export const finderSchema = z
  .object({
    name: z
      .string()
      .trim()
      .max(96, 'name cannot exceed 96 characters')
      .optional()
      .transform((v) => (v === '' ? undefined : v)),
  })
  .optional()
  .transform((v) => v ?? {});
export type ValidFinder = z.output<typeof finderSchema>;
