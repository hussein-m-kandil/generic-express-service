import * as Types from '@/types';
import { Request, Response, NextFunction } from 'express';
import { Model } from '@/../prisma/client';
import logger from '@/lib/logger';
import db from '@/lib/db';

export class CreationRegistrarError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CreationRegistrarError';
  }
}

const isOk = (res: Response) => res.statusCode >= 200 && res.statusCode < 300;

/**
 * An Express.js middleware that saves some creations into a custom table
 * after successful POST requests, for future analysis.
 * I reset the database periodically because I don't plan to maintain
 * this project long-term; I'm just practicing what I'm learning.
 * That's why I added this middleware—to base future analytics
 * on real users' creations.
 *
 * @param req - Express.js request object
 * @param res - Express.js response object
 * @param next - Express.js next function
 */
export function creationRegistrar(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const segments = req.originalUrl.split('/');
  const lastSegment = segments.at(-1);
  if (lastSegment) {
    const usersRoute = lastSegment === 'users';

    let user: Types.PublicUser | undefined;

    if (usersRoute) {
      // Intercept `res.json` to get the user from the response
      const originalResJSON = res.json;
      res.json = (body, ...args) => {
        if (typeof body === 'object' && body !== null && 'user' in body) {
          user = (body as Types.AuthResponse).user;
        }
        return originalResJSON.apply(res, [body, ...args]);
      };
    }

    res.on('finish', () => {
      try {
        if (req.method === 'POST' && isOk(res) && !segments.includes('auth')) {
          if (!usersRoute) {
            user = req.user as Types.PublicUser | undefined;
            if (!user) {
              const message = 'Expect `POST` request to be authenticated';
              throw new CreationRegistrarError(message);
            }
          } else if (!user) {
            const message =
              'Expect newly created user to be part of the body object';
            throw new CreationRegistrarError(message);
          }

          const ModelEnum = Model as Record<string, Model | undefined>;
          const model = ModelEnum[lastSegment.replace(/s$/, '').toUpperCase()];
          if (model) {
            const { username, isAdmin } = user;
            db.creation
              .create({ data: { username, isAdmin, model } })
              .then(() => logger.info(`New ${model} creation is registered`))
              .catch(logger.error);
          } else {
            logger.warn(`A creation on '${req.originalUrl}' is not registered`);
          }
        }
      } catch (error) {
        logger.error(error);
      }
    });
  }
  next();
}
