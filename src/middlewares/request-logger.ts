import { NextFunction, Request, Response } from 'express';
import logger from '../lib/logger';

export const logReq = (req: Request, res: Response, next: NextFunction) => {
  logger.log('<---');
  logger.info(`${req.method}: ${req.originalUrl}`);
  if (req.body) logger.info(req.body);
  logger.log('--->');
  next();
};

export default logReq;
