import { NextFunction, Request, Response } from 'express';
import AppError from '../lib/app-error';
import logger from '../lib/logger';
import { ZodError } from 'zod';

export const errorHandler = (
  error: unknown,
  req: Request,
  res: Response,
  _next: NextFunction
) => {
  logger.error(error);
  if (error instanceof ZodError) {
    res.status(400).json(error.issues);
  } else {
    const { name, message, statusCode } =
      error instanceof AppError
        ? error
        : new AppError('something went wrong', 500, 'ServerError');
    res.status(statusCode).json({ error: { name, message } });
  }
};

export default errorHandler;
