import * as Utils from '@/lib/utils';
import * as Schema from './profile.schema';
import * as Service from './profiles.service';
import * as Validators from '@/middlewares/validators';
import { Router } from 'express';
import io from '@/lib/io';

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

profilesRouter.get('/:idOrUsername', Validators.authValidator, async (req, res) => {
  const userId = Utils.getCurrentUserIdFromReq(req)!;
  res.json(await Service.getProfileByIdOrUsername(req.params.idOrUsername, userId));
});

profilesRouter.get('/:id/online', Validators.authValidator, async (req, res) => {
  // Every socket should be in 2 rooms: socket-id (default), and profile-id (joined on connection)
  const online = (await io.fetchSockets()).some((socket) => socket.rooms.has(req.params.id));
  res.json(online);
});

profilesRouter.patch('/', Validators.authValidator, async (req, res) => {
  const userId = Utils.getCurrentUserIdFromReq(req)!;
  const updates = Schema.profileSchema.parse(req.body);
  const updatedProfile = await Service.updateProfileByUserId(userId, updates);
  res.json(updatedProfile).on('finish', () => {
    const { tangible, visible } = updates;
    const { id: profileId } = updatedProfile;
    if (tangible !== undefined) io.volatile.except(profileId).emit('chats:updated');
    if (visible !== undefined) {
      io.volatile.except(profileId).emit(`${visible ? 'online' : 'offline'}:${profileId}`);
    }
  });
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
