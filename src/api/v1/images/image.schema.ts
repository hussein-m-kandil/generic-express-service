import { z } from 'zod';

export const altSchema = z.string().trim().optional();

export const imageSchema = z.object({ alt: altSchema });
