import { NextFunction, Request, Response } from 'express';
import { MAX_FILE_SIZE_MB } from '../lib/config';
import AppBaseError from '../lib/app-error';
import multer from 'multer';

export const createFileProcessor = (
  fieldName: string,
  fileSize = MAX_FILE_SIZE_MB * 1000 * 1000
) => {
  return [
    multer({
      storage: multer.memoryStorage(),
      limits: { fileSize, files: 1 },
    }).single(fieldName),
    (error: unknown, _req: Request, _res: Response, _next: NextFunction) => {
      if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
          error.message += ` (Max = ${MAX_FILE_SIZE_MB}MB)`;
        }
        throw new AppBaseError(error.message, 400, error.name);
      }
      throw error;
    },
  ];
};
