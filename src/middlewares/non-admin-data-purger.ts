import { NextFunction, Request, Response } from 'express';
import * as Utils from '@/lib/utils';
import logger from '@/lib/logger';

let lastCleanTime: number;

export async function nonAdminDataPurger(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const now = Date.now();
    if (
      req.method === 'GET' &&
      (!lastCleanTime || now - lastCleanTime >= Utils.PURGE_INTERVAL_MS)
    ) {
      await Utils.purgeNonAdminData(now, Utils.PURGE_INTERVAL_MS);
      logger.info('All non-admin data has been purged');
      lastCleanTime = now;
    }
  } catch (error) {
    logger.error('Could not clean the app data -', error);
  } finally {
    next();
  }
}

export default nonAdminDataPurger;
