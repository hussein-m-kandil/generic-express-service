import * as Validators from '@/middlewares/validators';
import * as Service from './notifications.service';
import * as Utils from '@/lib/utils';
import { Router } from 'express';

export const notificationsRouter = Router();

notificationsRouter.get('/', Validators.authValidator, async (req, res) => {
  const userId = Utils.getCurrentUserIdFromReq(req)!;
  res.json(await Service.getUserNotifications(userId));
});

notificationsRouter.get('/:id', Validators.authValidator, async (req, res) => {
  const userId = Utils.getCurrentUserIdFromReq(req)!;
  res.json(await Service.getUserNotificationById(req.params.id, userId));
});

notificationsRouter.patch('/seen', Validators.authValidator, async (req, res) => {
  const userId = Utils.getCurrentUserIdFromReq(req)!;
  await Service.markUserNotificationsAsSeen(userId);
  res.status(204).end();
});

notificationsRouter.delete('/:id', Validators.authValidator, async (req, res) => {
  const userId = Utils.getCurrentUserIdFromReq(req)!;
  await Service.deleteUserNotificationById(req.params.id, userId);
  res.status(204).end();
});

export default notificationsRouter;
