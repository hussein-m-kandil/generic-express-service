import { NextFunction, Request, Response } from 'express';
import { AppError } from '../lib/app-error';
import { AppErrorResponse } from '../types';
import { ZodError } from 'zod';
import logger from '../lib/logger';

export const errorHandler = (
  error: unknown,
  req: Request,
  res: Response,
  _next: NextFunction
) => {
  logger.error(error);
  let errorRes: AppErrorResponse;
  if (error instanceof ZodError) {
    res.status(400).json(error.issues);
  } else {
    const { name, message, statusCode } =
      error instanceof AppError
        ? error
        : new AppError('something went wrong', 500, 'ServerError');
    errorRes = { error: { name, message } };
    res.status(statusCode).json(errorRes);
  }
};

export default errorHandler;
