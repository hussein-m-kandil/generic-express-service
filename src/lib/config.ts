import logger from './logger';

if (!process.env.SECRET) logger.error('Missing Env Var: SECRET');
if (!process.env.ADMIN_SECRET) logger.error('Missing Env Var: ADMIN_SECRET');

export const SALT = 10;
export const SECRET = process.env.SECRET ?? 'secret';
export const ADMIN_SECRET = process.env.ADMIN_SECRET ?? 'admin_secret';

export default { SALT, SECRET, ADMIN_SECRET };
