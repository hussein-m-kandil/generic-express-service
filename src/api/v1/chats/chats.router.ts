import * as Utils from '@/lib/utils';
import * as Schema from './chat.schema';
import * as Service from './chats.service';
import * as Validators from '@/middlewares/validators';
import { Router } from 'express';

export const chatsRouter = Router();

chatsRouter.post('/', Validators.authValidator, async (req, res) => {
  const userId = Utils.getCurrentUserIdFromReq(req)!;
  const chat = await Service.createChat(userId, Schema.chatSchema.parse(req.body));
  res.status(201).json(chat);
});
