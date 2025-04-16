import { PrismaClient } from '../../prisma/generated/client';
import { GlobalWithPrisma } from '../types';
import logger from './logger';

const globalForPrisma = global as GlobalWithPrisma;

export let prismaClient: PrismaClient;

if (globalForPrisma.prisma) {
  logger.info('using cached prisma client...');
  prismaClient = globalForPrisma.prisma;
} else {
  logger.info('instantiating new prisma client...');
  prismaClient = new PrismaClient();
}

if (process.env.NODE_ENV !== 'production') {
  logger.info('caching prisma client...');
  globalForPrisma.prisma = prismaClient;
}

export default prismaClient;
