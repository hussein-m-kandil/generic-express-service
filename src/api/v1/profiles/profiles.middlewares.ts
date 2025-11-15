import * as Middlewares from '@/middlewares';
import { Request, Response, NextFunction } from 'express';
import logger from '@/lib/logger';
import db from '@/lib/db';

export const lastSeenUpdater = [
  Middlewares.optionalAuthValidator,
  async (req: Request, res: Response, next: NextFunction) => {
    if (req.user && 'id' in req.user && typeof req.user.id === 'string') {
      try {
        await db.profile.update({ where: { userId: req.user.id }, data: { lastSeen: new Date() } });
      } catch (error) {
        logger.error(error);
      }
    }
    next();
  },
];
