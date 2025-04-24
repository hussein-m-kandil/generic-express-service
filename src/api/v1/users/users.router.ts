import { Router } from 'express';
import usersService from './users.service';
import userSchema from './user.schema';
import { createJwtForUser } from '../../../lib/helpers';
import { AuthResponse } from '../../../types';

export const usersRouter = Router();

usersRouter.get('/', async (req, res) => {
  const users = await usersService.getAll();
  res.json(users);
});

usersRouter.post('/', async (req, res, next) => {
  try {
    const parsedNewUser = userSchema.parse(req.body);
    const createdUser = await usersService.createOne(parsedNewUser);
    const signupRes: AuthResponse = {
      token: createJwtForUser(createdUser),
      user: createdUser,
    };
    res.status(201).json(signupRes);
  } catch (error) {
    next(error);
  }
});

export default usersRouter;
