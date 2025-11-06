import * as Validators from '@/middlewares/validators';
import * as Service from './profiles.service';
import { Router } from 'express';

export const profilesRouter = Router();

profilesRouter.get('/', Validators.authValidator, async (req, res) => {
  res.json(await Service.getAllProfiles());
});

profilesRouter.get('/:id', Validators.authValidator, async (req, res) => {
  res.json(await Service.getProfileById(req.params.id));
});
