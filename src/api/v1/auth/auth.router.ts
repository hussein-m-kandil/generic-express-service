import * as Exp from 'express';
import * as Types from '@/types';
import * as Utils from '@/lib/utils';
import * as AppError from '@/lib/app-error';
import * as Validators from '@/middlewares/validators';
import { User } from '@/../prisma/client';
import passport from '@/lib/passport';
import logger from '@/lib/logger';

export const authRouter = Exp.Router();

authRouter.post('/signin', async (req, res, next) => {
  await (
    passport.authenticate(
      'local',
      { session: false },
      (error: unknown, user: User | false | null | undefined) => {
        if (error || !user) {
          if (error) logger.error(error);
          next(new AppError.AppSignInError());
        } else {
          req.login(user, { session: false }, (loginError) => {
            if (loginError) next(loginError);
            else {
              const token = Utils.createJwtForUser(user);
              const signinRes: Types.AuthResponse = { token, user };
              res.json(signinRes);
            }
          });
        }
      }
    ) as Exp.RequestHandler
  )(req, res, next);
});

authRouter.get('/me', Validators.authValidator, (req, res) => {
  res.json(req.user);
});

authRouter.get('/verify', Validators.authValidator, (req, res) => {
  res.json(true);
});

export default authRouter;
