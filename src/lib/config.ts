const ERR = 'EnvVarMissed';

if (!process.env.SECRET) console.error(`${ERR}: SECRET`);
if (!process.env.ADMIN_SECRET) console.error(`${ERR}: ADMIN_SECRET`);

export const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map((origin) => origin.trim())
  : [];

export const SECRET = process.env.SECRET ?? 'secret';
export const ADMIN_SECRET = process.env.ADMIN_SECRET ?? 'admin_secret';
export const PURGE_INTERVAL_DAYS = parseFloat(process.env.PURGE_INTERVAL_DAYS ?? '3');
export const MAX_FILE_SIZE_MB = Number(process.env.MAX_FILE_SIZE_MB) || 2;
export const TOKEN_EXP_PERIOD = process.env.TOKEN_EXP_PERIOD ?? '3d';
export const NODE_ENV = process.env.NODE_ENV;
export const CI = Boolean(process.env.CI);
