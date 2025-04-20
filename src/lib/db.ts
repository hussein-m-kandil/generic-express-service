import { PrismaClient } from '../../prisma/generated/client';
import { GlobalWithPrisma } from '../types';
import logger from './logger';

const globalForPrisma = global as GlobalWithPrisma;

export let prismaClient: PrismaClient;

logger.info();
logger.info(`using prisma client in ${process.env.NODE_ENV} mode`);

if (globalForPrisma.prisma) {
  logger.info('using cached prisma client...');
  prismaClient = globalForPrisma.prisma;
} else {
  logger.info('instantiating new prisma client...');
  prismaClient = new PrismaClient({
    // Read the URL programmatically to support replacing .env with .env.test in CLI
    datasourceUrl: process.env.DATABASE_URL,
  });
}

if (process.env.NODE_ENV !== 'production') {
  logger.info('caching prisma client...');
  const { protocol, host, pathname } = new URL(
    process.env.DATABASE_URL ?? 'postgres://x:y@z:5432/expect_db_url_env_var'
  );
  logger.info(`DB URL: ${protocol}//xxx:***@${host}${pathname}`);
  globalForPrisma.prisma = prismaClient;
}

logger.info();

export default prismaClient;
