import * as Utils from '@/lib/utils';
import * as Schema from './profile.schema';
import * as Service from './profiles.service';
import * as Validators from '@/middlewares/validators';
import { Router } from 'express';
import io from '@/lib/io';
import logger from '@/lib/logger';

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
  let allowed = false;
  try {
    const currentUserId = Utils.getCurrentUserIdFromReq(req)!;
    const currentProfile = await Service.getProfileByUserId(currentUserId, currentUserId);
    const profile = await Service.getProfileById(req.params.id, currentUserId);
    allowed = currentProfile.visible && profile.visible;
  } catch (error) {
    logger.error(error);
  }
  // Every socket should be in 2 rooms: socket-id (default), and profile-id (joined on connection)
  res.json(allowed && (await io.fetchSockets()).some((socket) => socket.rooms.has(req.params.id)));
});

profilesRouter.patch('/', Validators.authValidator, async (req, res) => {
  const userId = Utils.getCurrentUserIdFromReq(req)!;
  const updates = Schema.profileSchema.parse(req.body);
  const updatedProfile = await Service.updateProfileByUserId(userId, updates);
  res.json(updatedProfile).on('finish', () => {
    const { tangible, visible } = updates;
    const { id: profileId } = updatedProfile;
    io.except(profileId).emit('profiles:updated');
    io.except(profileId).emit(`profile:updated:${profileId}`);
    io.except(profileId).emit('profile:updated', profileId);
    if (visible !== undefined) {
      io.except(profileId).emit(`${visible ? 'online' : 'offline'}:${profileId}`);
    }
    if (tangible !== undefined) {
      io.except(profileId).emit('chats:updated');
    }
  });
});

profilesRouter.post('/following/:profileId', Validators.authValidator, async (req, res) => {
  const userId = Utils.getCurrentUserIdFromReq(req)!;
  const followingData = Schema.followingSchema.parse(req.params);
  await Service.createFollowing(userId, followingData);
  res
    .status(201)
    .json()
    .on('finish', () => {
      io.to(followingData.profileId).emit('notifications:updated');
    });
});

profilesRouter.delete('/following/:profileId', Validators.authValidator, async (req, res) => {
  const userId = Utils.getCurrentUserIdFromReq(req)!;
  const followingData = Schema.followingSchema.parse(req.params);
  await Service.deleteFollowing(userId, followingData);
  res
    .status(204)
    .send()
    .on('finish', () => {
      io.to(followingData.profileId).emit('notifications:updated');
    });
});
