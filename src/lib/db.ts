import { PrismaClient } from '../../prisma/generated/client';
import { CustomPrismaClient } from '../types';
import logger from './logger';

const globalForPrisma = global as typeof globalThis & {
  prisma: CustomPrismaClient | undefined;
};

export let prismaClient: CustomPrismaClient;

logger.info(`using prisma client in ${process.env.NODE_ENV} mode`);

if (globalForPrisma.prisma) {
  logger.info('using cached prisma client...');
  prismaClient = globalForPrisma.prisma;
} else {
  logger.info('instantiating new prisma client...');
  prismaClient = new PrismaClient({
    // Read the URL programmatically to support replacing .env with .env.test in CLI
    datasourceUrl: process.env.DATABASE_URL,
    // Globally omit the password field; need to be sat to false explicitly, to retrieve a user with password
    omit: {
      image: { storageFullPath: true, storageId: true },
      user: { password: true },
    },
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

export default prismaClient;
