import { Request, Response, NextFunction } from 'express';
import { RequestHandler } from 'express';
import { PublicUser } from '../types';
import passport from '../lib/passport';

export const createOwnerValidator = (
  getOwnerId: (req: Request, res: Response) => unknown,
): RequestHandler => {
  return async (req: Request, res: Response, next: NextFunction) => {
    const reqUser = req.user as PublicUser | undefined;
    const owner = reqUser?.id === (await getOwnerId(req, res));
    if (owner) next();
    else res.status(403).end();
  };
};

export const createAdminOrOwnerValidator = (
  getOwnerId: (req: Request, res: Response) => unknown,
): RequestHandler => {
  return async (req: Request, res: Response, next: NextFunction) => {
    const reqUser = req.user as PublicUser | undefined;
    const admin = reqUser?.isAdmin;
    const owner = reqUser?.id === (await getOwnerId(req, res));
    if (admin || owner) next();
    else res.status(403).end();
  };
};

export const adminValidator = (req: Request, res: Response, next: NextFunction) => {
  const reqUser = req.user as PublicUser | undefined;
  const admin = reqUser?.isAdmin;
  if (admin) next();
  else res.status(403).end();
};

export const authValidator = passport.authenticate('jwt', {
  session: false,
}) as RequestHandler;

export const optionalAuthValidator = async (req: Request, res: Response, next: NextFunction) => {
  if (req.headers.authorization) {
    // The purpose of this middleware is to optionally retrieve user info
    // if applicable, thereby preventing a 401 error on an invalid token
    const callNext: unknown = () => next();
    const controlledRes = {
      ...res,
      sendStatus: callNext as typeof res.sendStatus,
      send: callNext as typeof res.send,
      end: callNext as typeof res.end,
    } as Response;
    await authValidator(req, controlledRes, callNext as NextFunction);
  } else next();
};

export default {
  authValidator,
  adminValidator,
  createOwnerValidator,
  optionalAuthValidator,
  createAdminOrOwnerValidator,
};
