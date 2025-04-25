import { AppNotFoundError } from '../../../lib/app-error';
import { createJwtForUser } from '../../../lib/helpers';
import { AuthResponse } from '../../../types';
import { Router } from 'express';
import userSchema from './user.schema';
import usersService from './users.service';

export const usersRouter = Router();

usersRouter.get('/', async (req, res) => {
  const users = await usersService.getAll();
  res.json(users);
});

usersRouter.get('/:id', async (req, res) => {
  const user = await usersService.findOneById(req.params.id);
  if (!user) throw new AppNotFoundError('User not found');
  res.json(user);
});

usersRouter.post('/', async (req, res) => {
  const parsedNewUser = userSchema.parse(req.body);
  const createdUser = await usersService.createOne(parsedNewUser);
  const signupRes: AuthResponse = {
    token: createJwtForUser(createdUser),
    user: createdUser,
  };
  res.status(201).json(signupRes);
});

usersRouter.delete('/:id', async (req, res) => {
  await usersService.deleteOne(req.params.id);
  res.status(204).end();
});

export default usersRouter;
