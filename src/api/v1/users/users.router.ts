import * as Types from '@/types';
import * as Utils from '@/lib/utils';
import * as Schema from './user.schema';
import * as Service from './users.service';
import * as Validators from '@/middlewares/validators';
import { Router, Request, NextFunction } from 'express';
import { Prisma } from '@/../prisma/client';

export const usersRouter = Router();

usersRouter.get(
  '/',
  Validators.authValidator,
  Validators.adminValidator,
  async (req, res) => {
    const filters = Utils.getPaginationFiltersFromReqQuery(req);
    const users = await Service.getAllUsers(filters);
    res.json(users);
  }
);

usersRouter.get(
  '/:idOrUsername',
  Validators.optionalAuthValidator,
  async (req, res, next) => {
    const param = req.params.idOrUsername;
    const user = await Service.findUserByIdOrByUsernameOrThrow(param);
    if (param === user.id) {
      res.json(user);
    } else {
      const nextWrapper: NextFunction = (x: unknown) => {
        if (x) next(x);
        else res.json(user);
      };
      await Validators.createAdminOrOwnerValidator(() => user.id)(
        req,
        res,
        nextWrapper
      );
    }
  }
);

usersRouter.post('/', async (req, res) => {
  const parsedNewUser = Schema.userSchema.parse(req.body);
  const createdUser = await Service.createUser(parsedNewUser);
  const signupRes: Types.AuthResponse = {
    token: Utils.createJwtForUser(createdUser),
    user: createdUser,
  };
  res.status(201).json(signupRes);
});

usersRouter.patch(
  '/:id',
  Validators.authValidator,
  Validators.createAdminOrOwnerValidator((req) => req.params.id),
  async (req: Request<{ id: string }, unknown, Types.NewUserInput>, res) => {
    const { username, fullname, password, confirm, secret } = req.body;
    const data: Prisma.UserUpdateInput = {};
    if (username) data.username = Schema.usernameSchema.parse(username);
    if (fullname) data.fullname = Schema.fullnameSchema.parse(fullname);
    if (password) {
      data.password = Schema.passwordSchema.parse({
        password: password,
        confirm,
      }).password;
    }
    if (secret && Schema.secretSchema.parse(secret)) data.isAdmin = true;
    await Service.updateUser(req.params.id, data);
    res.status(204).end();
  }
);

usersRouter.delete(
  '/:id',
  Validators.authValidator,
  Validators.createAdminOrOwnerValidator((req) => req.params.id),
  async (req, res) => {
    await Service.deleteUser(req.params.id);
    res.status(204).end();
  }
);
