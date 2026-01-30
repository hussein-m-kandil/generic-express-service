import * as Utils from '@/lib/utils';
import * as Schema from './profile.schema';
import * as Service from './profiles.service';
import * as Validators from '@/middlewares/validators';
import { Router } from 'express';

export const profilesRouter = Router();

profilesRouter.get('/', Validators.authValidator, async (req, res) => {
  const userId = Utils.getCurrentUserIdFromReq(req)!;
  const filters = Utils.getProfileFiltersFromReqQuery(req);
  res.json(await Service.getAllProfiles(userId, filters));
});

profilesRouter.get('/following', Validators.authValidator, async (req, res) => {
  const userId = Utils.getCurrentUserIdFromReq(req)!;
  const filters = Utils.getProfileFiltersFromReqQuery(req);
  res.json(await Service.getAllFollowing(userId, filters));
});

profilesRouter.get('/followers', Validators.authValidator, async (req, res) => {
  const userId = Utils.getCurrentUserIdFromReq(req)!;
  const filters = Utils.getProfileFiltersFromReqQuery(req);
  res.json(await Service.getAllFollowers(userId, filters));
});

profilesRouter.get('/:id', Validators.authValidator, async (req, res) => {
  const userId = Utils.getCurrentUserIdFromReq(req)!;
  res.json(await Service.getProfileById(req.params.id, userId));
});

profilesRouter.patch('/', Validators.authValidator, async (req, res) => {
  const userId = Utils.getCurrentUserIdFromReq(req)!;
  res.json(await Service.updateProfileByUserId(userId, Schema.profileSchema.parse(req.body)));
});

profilesRouter.post('/following/:profileId', Validators.authValidator, async (req, res) => {
  const userId = Utils.getCurrentUserIdFromReq(req)!;
  await Service.createFollowing(userId, Schema.followingSchema.parse(req.params));
  res.status(201).json();
});

profilesRouter.delete('/following/:profileId', Validators.authValidator, async (req, res) => {
  const userId = Utils.getCurrentUserIdFromReq(req)!;
  await Service.deleteFollowing(userId, Schema.followingSchema.parse(req.params));
  res.status(204).send();
});
