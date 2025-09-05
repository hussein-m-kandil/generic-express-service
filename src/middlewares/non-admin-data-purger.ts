import { NextFunction, Request, Response } from 'express';
import * as Utils from '@/lib/utils';
import logger from '@/lib/logger';

export function createNonAdminDataPurger(initLastPurgeTime = 0) {
  let lastPurgeTime = initLastPurgeTime;

  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const now = Date.now();
      if (
        (req.method === 'GET' || req.originalUrl.split('/').includes('auth')) &&
        (!lastPurgeTime || now - lastPurgeTime >= Utils.PURGE_INTERVAL_MS)
      ) {
        await Utils.purgeNonAdminData(now, Utils.PURGE_INTERVAL_MS);
        logger.info('All non-admin data has been purged');
        lastPurgeTime = now;
      }
    } catch (error) {
      logger.error('Could not purge the non-admin data -', error);
    } finally {
      next();
    }
  };
}

export default createNonAdminDataPurger;
