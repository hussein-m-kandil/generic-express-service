import * as Types from '@/types';
import * as JWT from 'passport-jwt';
import * as Utils from '@/lib/utils';
import * as Config from '@/lib/config';
import * as PassportLocal from 'passport-local';
import passport from 'passport';
import bcrypt from 'bcryptjs';
import db from '@/lib/db';

passport.use(
  new PassportLocal.Strategy(
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
  new JWT.Strategy(
    {
      jwtFromRequest: JWT.ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: Config.SECRET,
    },
    (jwtPayload: Types.AppJwtPayload, done) => {
      const { id } = jwtPayload;
      db.user
        .findUnique({ where: { id }, ...Utils.userAggregation })
        .then((user) => {
          if (user) done(null, user);
          else done(null, false);
        })
        .catch((error: unknown) => done(error, false));
    }
  )
);

export { passport };
export default passport;
