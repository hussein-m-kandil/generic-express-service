import { Request, Response, NextFunction } from 'express';
import { RequestHandler } from 'express';
import { AppJwtPayload } from '../types';
import passport from '../lib/passport';
import db from '../lib/db';

const isAdmin = async (id: string): Promise<boolean> => {
  const dbUser = await db.user.findUnique({
    where: { id },
    select: { isAdmin: true },
  });
  return Boolean(dbUser?.isAdmin);
};

export const createOwnerValidator = (
  getOwnerId: (req: Request, res: Response) => unknown
): RequestHandler => {
  return async (req: Request, res: Response, next: NextFunction) => {
    const reqUser = req.user as AppJwtPayload | undefined;
    const owner = reqUser?.id === (await getOwnerId(req, res));
    if (owner) next();
    else res.status(401).end();
  };
};

export const createAdminOrOwnerValidator = (
  getOwnerId: (req: Request, res: Response) => unknown
): RequestHandler => {
  return async (req: Request, res: Response, next: NextFunction) => {
    const reqUser = req.user as AppJwtPayload | undefined;
    const admin = reqUser && (await isAdmin(reqUser.id));
    const owner = reqUser?.id === (await getOwnerId(req, res));
    if (admin || owner) next();
    else res.status(401).end();
  };
};

export const adminValidator = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const reqUser = req.user as AppJwtPayload | undefined;
  const admin = reqUser && (await isAdmin(reqUser.id));
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
