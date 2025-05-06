import { Request, Router } from 'express';
import { createJwtForUser } from '../../../lib/helpers';
import { AppNotFoundError } from '../../../lib/app-error';
import { AuthResponse, NewUserInput } from '../../../types';
import { Prisma } from '../../../../prisma/generated/client';
import {
  authValidator,
  adminValidator,
  createAdminOrOwnerValidator,
} from '../../../middlewares/validators';
import userSchema, {
  usernameSchema,
  fullnameSchema,
  passwordSchema,
  secretSchema,
} from './user.schema';
import usersService from './users.service';

export const usersRouter = Router();

usersRouter.get('/', authValidator, adminValidator, async (req, res) => {
  const users = await usersService.getAll();
  res.json(users);
});

usersRouter.get(
  '/:id',
  authValidator,
  createAdminOrOwnerValidator((req) => req.params.id),
  async (req, res) => {
    const user = await usersService.findOneById(req.params.id);
    if (!user) throw new AppNotFoundError('User not found');
    res.json(user);
  }
);

usersRouter.post('/', async (req, res) => {
  const parsedNewUser = userSchema.parse(req.body);
  const createdUser = await usersService.createOne(parsedNewUser);
  const signupRes: AuthResponse = {
    token: createJwtForUser(createdUser),
    user: createdUser,
  };
  res.status(201).json(signupRes);
});

usersRouter.patch(
  '/:id',
  authValidator,
  createAdminOrOwnerValidator((req) => req.params.id),
  async (req: Request<{ id: string }, unknown, NewUserInput>, res) => {
    const { username, fullname, password, confirm, secret } = req.body;
    const data: Prisma.UserUpdateInput = {};
    if (username) data.username = usernameSchema.parse(username);
    if (fullname) data.fullname = fullnameSchema.parse(fullname);
    if (password) {
      data.password = passwordSchema.parse({
        password: password,
        confirm,
      }).password;
    }
    if (secret && secretSchema.parse(secret)) data.isAdmin = true;
    await usersService.updateOne(req.params.id, data);
    res.status(204).end();
  }
);

usersRouter.delete(
  '/:id',
  authValidator,
  createAdminOrOwnerValidator((req) => req.params.id),
  async (req, res) => {
    await usersService.deleteOne(req.params.id);
    res.status(204).end();
  }
);

export default usersRouter;
