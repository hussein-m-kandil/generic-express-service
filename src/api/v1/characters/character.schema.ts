import { z } from 'zod';

export const pointNumberSchema = z.coerce.number().transform((n) => Math.trunc(n <= 0 ? 0 : n));

export const selectionsSchema = z.preprocess(
  <T>(value: T | T[]): T[] => (Array.isArray(value) ? value : [value]),
  z.array(
    z.object({
      selectedPoint: z.object({ x: pointNumberSchema, y: pointNumberSchema }),
      characterName: z.string().trim(),
    })
  )
);

export type ValidSelections = z.output<typeof selectionsSchema>;

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
