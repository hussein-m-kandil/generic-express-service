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
  logger.info(process.env.DATABASE_URL);
  globalForPrisma.prisma = prismaClient;
}

logger.info();

export default prismaClient;
