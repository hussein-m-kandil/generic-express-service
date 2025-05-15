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
        .findUnique({
          where: { username: username },
          omit: { password: false },
        })
        .then((user) => {
          if (user) {
            const { password: dbPassword, ...userPublicData } = user;
            bcrypt.compare(password, dbPassword, (error, verified) => {
              if (error) done(error, false);
              else if (!verified) done(null, false);
              else done(null, userPublicData);
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
