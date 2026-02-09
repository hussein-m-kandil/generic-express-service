import * as Types from '@/types';
import * as Utils from '@/lib/utils';
import * as Image from '@/lib/image';
import * as Schema from './chat.schema';
import * as Storage from '@/lib/storage';
import * as Service from './chats.service';
import * as Middlewares from '@/middlewares';
import { Request, Response, Router } from 'express';
import logger from '@/lib/logger';

export const chatsRouter = Router();

const prepareImageData = async (
  req: Request & { file?: Express.Multer.File },
  imagedata: Schema.ValidMessage['imagedata'],
  user: Types.PublicUser,
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
  res.json(chats).on('finish', () => {
    const rooms = Service.getOtherChatsMemberIds(userId, chats);
    Utils.emitToRoomsIfAny({ rooms, event: 'chats:received', volatile: true });
  });
});

chatsRouter.get('/members/:profileId', Middlewares.authValidator, async (req, res) => {
  const userId = Utils.getCurrentUserIdFromReq(req)!;
  const chats = await Service.getUserChatsByMember(userId, req.params.profileId);
  res.json(chats).on('finish', () => {
    const rooms = Service.getOtherChatsMemberIds(userId, chats);
    Utils.emitToRoomsIfAny({ rooms, event: 'chats:received', volatile: true });
  });
});

chatsRouter.get('/:id', Middlewares.authValidator, async (req, res) => {
  const chatId = req.params.id;
  const userId = Utils.getCurrentUserIdFromReq(req)!;
  const chat = await Service.getUserChatById(userId, chatId);
  res.json(chat).on('finish', () => {
    Service.getOtherChatMemberIds(userId, chatId)
      .then((rooms) => Utils.emitToRoomsIfAny({ rooms, event: 'chats:received', volatile: true }))
      .catch((error: unknown) => logger.error('Failed to broadcast "chats:received"', error));
  });
});

chatsRouter.get('/:id/messages', Middlewares.authValidator, async (req, res) => {
  const chatId = req.params.id;
  const userId = Utils.getCurrentUserIdFromReq(req)!;
  const filters = Utils.getBasePaginationFiltersFromReqQuery(req);
  const messages = await Service.getUserChatMessages(userId, chatId, filters);
  res.json(messages).on('finish', () => {
    Service.getOtherChatMemberIds(userId, chatId)
      .then((rooms) => Utils.emitToRoomsIfAny({ rooms, event: 'chats:received', volatile: true }))
      .catch((error: unknown) => logger.error('Failed to broadcast "chats:received"', error));
  });
});

chatsRouter.get('/:id/messages/:msgId', Middlewares.authValidator, async (req, res) => {
  const chatId = req.params.id;
  const userId = Utils.getCurrentUserIdFromReq(req)!;
  const msg = await Service.getUserChatMessageById(userId, chatId, req.params.msgId);
  res.json(msg).on('finish', () => {
    Service.getOtherChatMemberIds(userId, chatId)
      .then((rooms) => Utils.emitToRoomsIfAny({ rooms, event: 'chats:received', volatile: true }))
      .catch((error: unknown) => logger.error('Failed to broadcast "chats:received"', error));
  });
});

chatsRouter.post(
  '/',
  Middlewares.authValidator,
  Middlewares.createFileProcessor('image'),
  async (req: Request, res: Response) => {
    const user = Utils.getCurrentUserFromReq(req)!;
    const chatData = (req.file ? Schema.chatWithOptionalMessageSchema : Schema.chatSchema).parse(
      req.body,
    );
    const preparedImageData = await prepareImageData(req, chatData.message.imagedata, user);
    const createdChat = await Service.createChat(user, chatData, ...preparedImageData);
    res
      .status(201)
      .json(createdChat)
      .on('finish', () => {
        Service.getOtherChatMemberIds(user.id, createdChat.id)
          .then((rooms) =>
            Utils.emitToRoomsIfAny({ rooms, event: 'chats:updated', volatile: true }),
          )
          .catch((error: unknown) => logger.error('Failed to broadcast "chats:updated"', error));
      });
  },
);

chatsRouter.patch('/:id/seen', Middlewares.authValidator, async (req, res) => {
  const chatId = req.params.id;
  const userId = Utils.getCurrentUserIdFromReq(req)!;
  res.json(await Service.updateProfileChatLastSeenDate(userId, chatId)).on('finish', () => {
    Service.getOtherChatMemberIds(userId, chatId)
      .then((rooms) => Utils.emitToRoomsIfAny({ rooms, event: 'chats:updated', volatile: true }))
      .catch((error: unknown) => logger.error('Failed to broadcast "chats:updated"', error));
  });
});

chatsRouter.post(
  '/:id/messages',
  Middlewares.authValidator,
  Middlewares.createFileProcessor('image'),
  async (req: Request, res: Response) => {
    const chatId = req.params.id;
    const user = Utils.getCurrentUserFromReq(req)!;
    const { imagedata, ...msgData } = (
      req.file ? Schema.optionalMessageSchema : Schema.messageSchema
    ).parse(req.body);
    const preparedImageData = await prepareImageData(req, imagedata, user);
    const msgArgs = [user, chatId, msgData, ...preparedImageData] as const;
    const createdMessage = await Service.createUserChatMessage(...msgArgs);
    res
      .status(201)
      .json(createdMessage)
      .on('finish', () => {
        Service.getOtherChatMemberIds(user.id, chatId)
          .then((rooms) =>
            Utils.emitToRoomsIfAny({ rooms, event: 'chats:updated', volatile: true }),
          )
          .catch((error: unknown) => logger.error('Failed to broadcast "chats:updated"', error));
      });
  },
);

chatsRouter.delete('/:id', Middlewares.authValidator, async (req, res) => {
  const chatId = req.params.id;
  const userId = Utils.getCurrentUserIdFromReq(req)!;
  await Service.deleteChat(userId, chatId);
  res
    .status(204)
    .send()
    .on('finish', () => {
      Service.getOtherChatMemberIds(userId, chatId)
        .then((rooms) => Utils.emitToRoomsIfAny({ rooms, event: 'chats:updated', volatile: true }))
        .catch((error: unknown) => logger.error('Failed to broadcast "chats:updated"', error));
    });
});
