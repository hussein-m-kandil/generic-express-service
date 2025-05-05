import { RequestHandler } from 'express';
import passport from '../lib/passport';

export const authValidator = passport.authenticate('jwt', {
  session: false,
}) as RequestHandler;

export default { authValidator };
