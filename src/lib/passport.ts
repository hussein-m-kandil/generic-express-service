import { Strategy as JwtStrategy, ExtractJwt } from 'passport-jwt';
import { Strategy as LocalStrategy } from 'passport-local';
import { AppJwtPayload } from '../types';
import { SECRET } from './config';
import db from './db';
import bcrypt from 'bcryptjs';
import passport from 'passport';

passport.use(
  new LocalStrategy(
    {
      usernameField: 'username',
      passwordField: 'password',
    },
    (username, password, done) => {
      db.user
        .findUnique({ where: { username: username } })
        .then((user) => {
          if (user) {
            bcrypt.compare(password, user.password, (error, verified) => {
              if (error) done(error, false);
              else if (!verified) done(null, false);
              else done(null, user);
            });
          } else done(null, false);
        })
        .catch((error: unknown) => done(error, false));
    }
  )
);

passport.use(
  new JwtStrategy(
    {
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: SECRET,
    },
    (jwtPayload: AppJwtPayload, done) => done(null, jwtPayload)
  )
);

export default passport;
