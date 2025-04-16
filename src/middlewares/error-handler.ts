import { NextFunction, Request, Response } from 'express';
import AppError from '../lib/app-error';
import logger from '../lib/logger';

export const errorHandler = (
  error: unknown,
  req: Request,
  res: Response,
  _next: NextFunction
) => {
  logger.error(error);
  const { name, message, statusCode } =
    error instanceof AppError
      ? error
      : new AppError('something went wrong', 500, 'ServerError');
  res.status(statusCode).json({ error: { name, message } });
};

export default errorHandler;
