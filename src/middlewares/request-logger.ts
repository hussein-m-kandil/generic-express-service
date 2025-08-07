import { NextFunction, Request, Response } from 'express';
import logger from '../lib/logger';

export const requestLogger = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const start = process.hrtime();

  res.on('finish', () => {
    const [seconds, nanoseconds] = process.hrtime(start);
    const duration = (seconds * 1e3 + nanoseconds / 1e6).toFixed(3);
    const len = res.getHeader('Content-Length') ?? 0;
    const { originalUrl: url, method } = req;
    const status = res.statusCode;
    logger.http(`${status} ${method} ${url} ${len} - ${duration} ms`);
  });

  next();
};

export default requestLogger;
