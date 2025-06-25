import { createClient } from '@supabase/supabase-js';

const ERR = 'EnvVarMissed';

if (!process.env.SECRET) console.error(`${ERR}: SECRET`);
if (!process.env.NODE_ENV) console.warn(`${ERR}: NODE_ENV`);
if (!process.env.ADMIN_SECRET) console.error(`${ERR}: ADMIN_SECRET`);
if (!process.env.ALLOWED_ORIGINS) console.log(`${ERR}: ALLOWED_ORIGINS`);

if (
  !process.env.SUPABASE_URL ||
  !process.env.SUPABASE_BUCKET ||
  !process.env.STORAGE_ROOT_DIR ||
  !process.env.SUPABASE_ANON_KEY ||
  !process.env.SUPABASE_BUCKET_URL
) {
  throw new Error(
    `${ERR}: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_BUCKET, SUPABASE_BUCKET_URL, or STORAGE_ROOT_DIR`
  );
}

export const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map((origin) => origin.trim())
  : [];

export const SALT = (Number(process.env.SALT) || process.env.SALT) ?? 10;
export const SECRET = process.env.SECRET ?? 'secret';
export const ADMIN_SECRET = process.env.ADMIN_SECRET ?? 'admin_secret';
export const TOKEN_EXP_PERIOD = process.env.TOKEN_EXP_PERIOD ?? '3d';
export const NODE_ENV = process.env.NODE_ENV;
export const CI = Boolean(process.env.CI);

export const SUPABASE_URL = process.env.SUPABASE_URL;
export const SUPABASE_BUCKET = process.env.SUPABASE_BUCKET;
export const STORAGE_ROOT_DIR = process.env.STORAGE_ROOT_DIR;
export const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
export const SUPABASE_BUCKET_URL = process.env.SUPABASE_BUCKET_URL;
export const MAX_FILE_SIZE_MB = Number(process.env.MAX_FILE_SIZE_MB) || 2;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export default {
  SUPABASE_BUCKET_URL,
  SUPABASE_ANON_KEY,
  TOKEN_EXP_PERIOD,
  MAX_FILE_SIZE_MB,
  STORAGE_ROOT_DIR,
  SUPABASE_BUCKET,
  ALLOWED_ORIGINS,
  ADMIN_SECRET,
  SUPABASE_URL,
  NODE_ENV,
  SECRET,
  SALT,
  CI,
  supabase,
};
