if (!process.env.NODE_ENV) console.warn('Miss Env Var: NODE_ENV');
if (!process.env.SECRET) console.error('Missing Env Var: SECRET');
if (!process.env.ADMIN_SECRET) console.error('Missing Env Var: ADMIN_SECRET');
if (!process.env.ALLOWED_ORIGINS)
  console.log('Missing Env Var: ALLOWED_ORIGINS');

export const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map((origin) => origin.trim())
  : [];

export const SALT = (Number(process.env.SALT) || process.env.SALT) ?? 10;
export const SECRET = process.env.SECRET ?? 'secret';
export const ADMIN_SECRET = process.env.ADMIN_SECRET ?? 'admin_secret';
export const TOKEN_EXP_PERIOD = process.env.TOKEN_EXP_PERIOD ?? '3d';
export const NODE_ENV = process.env.NODE_ENV;
export const CI = Boolean(process.env.CI);

export default {
  TOKEN_EXP_PERIOD,
  ALLOWED_ORIGINS,
  ADMIN_SECRET,
  NODE_ENV,
  SECRET,
  SALT,
  CI,
};
