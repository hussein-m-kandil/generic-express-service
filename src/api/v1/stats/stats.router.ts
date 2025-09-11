import { authValidator } from '@/middlewares';
import { getStats } from './stats.service';
import { Router } from 'express';

export const statsRouter = Router();

statsRouter.get('/', authValidator, async (req, res) => {
  res.json(await getStats());
});
