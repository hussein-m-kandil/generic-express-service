import {
  createJwtForUser,
  convertUserToPublicUser,
} from '../../../lib/helpers';
import { User } from '../../../../prisma/generated/client';
import { AppSignInError } from '../../../lib/app-error';
import { RequestHandler, Router } from 'express';
import { AuthResponse } from '../../../types';
import logger from '../../../lib/logger';
import passport from '../../../lib/passport';

export const authRouter = Router();

authRouter.post('/signin', async (req, res, next) => {
  await (
    passport.authenticate(
      'local',
      { session: false },
      (error: unknown, user: User | false | null | undefined) => {
        if (error || !user) {
          if (error) logger.error(error);
          next(new AppSignInError());
        } else {
          req.login(user, { session: false }, (loginError) => {
            if (loginError) next(loginError);
            else {
              const loginRes: AuthResponse = {
                token: createJwtForUser(user),
                user: convertUserToPublicUser(user),
              };
              res.json(loginRes);
            }
          });
        }
      }
    ) as RequestHandler
  )(req, res, next);
});

export default authRouter;
