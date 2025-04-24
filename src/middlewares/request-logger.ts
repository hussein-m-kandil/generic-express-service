import { NextFunction, Request, Response } from 'express';
import { CI } from '../lib/config';
import logger from '../lib/logger';

export const logReq = (req: Request, res: Response, next: NextFunction) => {
  if (CI) {
    logger.info(`${req.method}: ${req.originalUrl}`);
  } else {
    logger.info(`${req.method}: ${req.originalUrl}`, req.body);
  }
  next();
};

export default logReq;
