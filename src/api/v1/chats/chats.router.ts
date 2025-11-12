import * as Utils from '@/lib/utils';
import * as Schema from './chat.schema';
import * as Service from './chats.service';
import * as Validators from '@/middlewares/validators';
import { Router } from 'express';

export const chatsRouter = Router();

chatsRouter.get('/', Validators.authValidator, async (req, res) => {
  const userId = Utils.getCurrentUserIdFromReq(req)!;
  const filters = Utils.getBasePaginationFiltersFromReqQuery(req);
  const chats = await Service.getUserChats(userId, filters);
  res.json(chats);
});

chatsRouter.get('/:id', Validators.authValidator, async (req, res) => {
  const userId = Utils.getCurrentUserIdFromReq(req)!;
  const chat = await Service.getUserChatById(userId, req.params.id);
  res.json(chat);
});

chatsRouter.get('/:id/messages', Validators.authValidator, async (req, res) => {
  const userId = Utils.getCurrentUserIdFromReq(req)!;
  const filters = Utils.getBasePaginationFiltersFromReqQuery(req);
  const messages = await Service.getUserChatMessages(userId, req.params.id, filters);
  res.json(messages);
});

chatsRouter.get('/:id/messages/:msgId', Validators.authValidator, async (req, res) => {
  const userId = Utils.getCurrentUserIdFromReq(req)!;
  const msg = await Service.getUserChatMessageById(userId, req.params.id, req.params.msgId);
  res.json(msg);
});

chatsRouter.post('/:id/messages/:msgId/seen', Validators.authValidator, async (req, res) => {
  const userId = Utils.getCurrentUserIdFromReq(req)!;
  await Service.setSeenMessage(userId, req.params.id, req.params.msgId);
  res.json();
});

chatsRouter.post('/', Validators.authValidator, async (req, res) => {
  const userId = Utils.getCurrentUserIdFromReq(req)!;
  const chat = await Service.createChat(userId, Schema.chatSchema.parse(req.body));
  res.status(201).json(chat);
});

chatsRouter.delete('/:id', Validators.authValidator, async (req, res) => {
  const userId = Utils.getCurrentUserIdFromReq(req)!;
  await Service.deleteChat(userId, req.params.id);
  res.status(204).send();
});
