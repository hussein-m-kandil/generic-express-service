import { Router } from 'express';
import usersService from './users.service';

const usersRouter = Router();

usersRouter.get('/', async (req, res) => {
  const users = await usersService.getAll();
  res.json(users);
});

export default usersRouter;
