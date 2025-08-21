import { z } from 'zod';

export const posSchema = z.coerce
  .number()
  .optional()
  .transform((n) => n && Math.trunc(n));

export const scaleSchema = z.coerce.number().optional();

export const infoSchema = z.string().trim().optional();

export const altSchema = z.string().trim().optional();

export const imageSchema = z.object({
  scale: scaleSchema,
  info: infoSchema,
  xPos: posSchema,
  yPos: posSchema,
  alt: altSchema,
});
