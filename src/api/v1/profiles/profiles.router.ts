import * as Validators from '@/middlewares/validators';
import * as Service from './profiles.service';
import * as Schema from './profile.schema';
import { User } from '@/../prisma/client';
import { Router } from 'express';

export const profilesRouter = Router();

profilesRouter.get('/', Validators.authValidator, async (req, res) => {
  res.json(await Service.getAllProfiles());
});

profilesRouter.get('/:id', Validators.authValidator, async (req, res) => {
  res.json(await Service.getProfileById(req.params.id));
});

profilesRouter.patch('/', Validators.authValidator, async (req, res) => {
  const userId = (req.user as User).id;
  res.json(await Service.updateProfileByUserId(userId, Schema.profileSchema.parse(req.body)));
});
