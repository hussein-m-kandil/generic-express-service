import * as Types from '@/types';
import * as Utils from '@/lib/utils';
import * as Image from '@/lib/image';
import * as Schema from './chat.schema';
import * as Storage from '@/lib/storage';
import * as Service from './chats.service';
import * as Middlewares from '@/middlewares';
import { Request, Response, Router } from 'express';

export const chatsRouter = Router();

const prepareImageData = async (
  req: Request & { file?: Express.Multer.File },
  imagedata: Schema.ValidMessage['imagedata'],
  user: Types.PublicUser
) => {
  let uploadedImage: Storage.UploadedImageData | undefined;
  let imageData: Types.ImageFullData | undefined;
  if (req.file) {
    const file = await Image.getValidImageFileFormReq(req);
    imageData = { ...(imagedata ?? {}), ...Image.getImageMetadata(file) };
    uploadedImage = await Storage.uploadImage(file, user);
  }
  return [imageData, uploadedImage] as const;
};

chatsRouter.get('/', Middlewares.authValidator, async (req, res) => {
  const userId = Utils.getCurrentUserIdFromReq(req)!;
  const filters = Utils.getBasePaginationFiltersFromReqQuery(req);
  const chats = await Service.getUserChats(userId, filters);
  res.json(chats);
});

chatsRouter.get('/:id', Middlewares.authValidator, async (req, res) => {
  const userId = Utils.getCurrentUserIdFromReq(req)!;
  const chat = await Service.getUserChatById(userId, req.params.id);
  res.json(chat);
});

chatsRouter.get('/:id/messages', Middlewares.authValidator, async (req, res) => {
  const userId = Utils.getCurrentUserIdFromReq(req)!;
  const filters = Utils.getBasePaginationFiltersFromReqQuery(req);
  const messages = await Service.getUserChatMessages(userId, req.params.id, filters);
  res.json(messages);
});

chatsRouter.get('/:id/messages/:msgId', Middlewares.authValidator, async (req, res) => {
  const userId = Utils.getCurrentUserIdFromReq(req)!;
  const msg = await Service.getUserChatMessageById(userId, req.params.id, req.params.msgId);
  res.json(msg);
});

chatsRouter.post(
  '/',
  Middlewares.authValidator,
  Middlewares.createFileProcessor('image'),
  async (req: Request, res: Response) => {
    const user = Utils.getCurrentUserFromReq(req)!;
    const chatData = Schema.chatSchema.parse(req.body);
    const preparedImageData = await prepareImageData(req, chatData.message.imagedata, user);
    const createdChat = await Service.createChat(user, chatData, ...preparedImageData);
    res.status(201).json(createdChat);
  }
);

chatsRouter.post(
  '/:id/messages',
  Middlewares.authValidator,
  Middlewares.createFileProcessor('image'),
  async (req: Request, res: Response) => {
    const user = Utils.getCurrentUserFromReq(req)!;
    const { imagedata, ...msgData } = Schema.messageSchema.parse(req.body);
    const preparedImageData = await prepareImageData(req, imagedata, user);
    const msgArgs = [user, req.params.id, msgData, ...preparedImageData] as const;
    const createdMessage = await Service.createUserChatMessage(...msgArgs);
    res.status(201).json(createdMessage);
  }
);

chatsRouter.post('/:id/messages/:msgId/seen', Middlewares.authValidator, async (req, res) => {
  const userId = Utils.getCurrentUserIdFromReq(req)!;
  await Service.setSeenMessage(userId, req.params.id, req.params.msgId);
  res.json();
});

chatsRouter.delete('/:id', Middlewares.authValidator, async (req, res) => {
  const userId = Utils.getCurrentUserIdFromReq(req)!;
  await Service.deleteChat(userId, req.params.id);
  res.status(204).send();
});
