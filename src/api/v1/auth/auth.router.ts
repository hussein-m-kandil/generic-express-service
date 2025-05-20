import { authValidator } from '../../../middlewares/validators';
import { User } from '../../../../prisma/generated/client';
import { createJwtForUser } from '../../../lib/helpers';
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
              const token = createJwtForUser(user);
              const signinRes: AuthResponse = { token, user };
              res.json(signinRes);
            }
          });
        }
      }
    ) as RequestHandler
  )(req, res, next);
});

authRouter.get('/me', authValidator, (req, res) => {
  res.json(req.user);
});

authRouter.get('/verify', authValidator, (req, res) => {
  res.json(true);
});

export default authRouter;
