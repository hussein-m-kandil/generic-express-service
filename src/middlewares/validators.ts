import { Request, Response, NextFunction } from 'express';
import { RequestHandler } from 'express';
import { PublicUser } from '../types';
import passport from '../lib/passport';

export const createOwnerValidator = (
  getOwnerId: (req: Request, res: Response) => unknown
): RequestHandler => {
  return async (req: Request, res: Response, next: NextFunction) => {
    const reqUser = req.user as PublicUser | undefined;
    const owner = reqUser?.id === (await getOwnerId(req, res));
    if (owner) next();
    else res.status(401).end();
  };
};

export const createAdminOrOwnerValidator = (
  getOwnerId: (req: Request, res: Response) => unknown
): RequestHandler => {
  return async (req: Request, res: Response, next: NextFunction) => {
    const reqUser = req.user as PublicUser | undefined;
    const admin = reqUser?.isAdmin;
    const owner = reqUser?.id === (await getOwnerId(req, res));
    if (admin || owner) next();
    else res.status(401).end();
  };
};

export const adminValidator = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const reqUser = req.user as PublicUser | undefined;
  const admin = reqUser?.isAdmin;
  if (admin) next();
  else res.status(401).end();
};

export const authValidator = passport.authenticate('jwt', {
  session: false,
}) as RequestHandler;

export const optionalAuthValidator = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  if (req.headers.authorization) {
    await authValidator(req, res, next);
  } else next();
};

export default {
  authValidator,
  adminValidator,
  createOwnerValidator,
  optionalAuthValidator,
  createAdminOrOwnerValidator,
};
