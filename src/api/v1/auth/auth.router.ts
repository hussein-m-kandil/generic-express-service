import { User } from '../../../../prisma/generated/client';
import { AppSignInError } from '../../../lib/app-error';
import { RequestHandler, Router } from 'express';
import { SignInResponse } from '../../../types';
import logger from '../../../lib/logger';
import authService from './auth.service';
import passport from '../../../lib/passport';

export const authRouter = Router();

authRouter.post('/signin', async (req, res, next) => {
  try {
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
                const loginRes: SignInResponse = {
                  token: authService.getJwtFromUser(user),
                  user: authService.getPublicUserFromUser(user),
                };
                res.json(loginRes);
              }
            });
          }
        }
      ) as RequestHandler
    )(req, res, next);
  } catch (error) {
    next(error);
  }
});

export default authRouter;
