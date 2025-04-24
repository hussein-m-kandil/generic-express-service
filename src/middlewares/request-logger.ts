import { NextFunction, Request, Response } from 'express';
import logger from '../lib/logger';

export const requestLogger = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const body = req.body as unknown;
  logger.info(`${req.method}: ${req.originalUrl}`, { body });
  next();
};

export default requestLogger;
