import * as Types from '@/types';
import * as Utils from '@/lib/utils';
import * as Image from '@/lib/image';
import * as Schema from './chat.schema';
import * as Storage from '@/lib/storage';
import { Chat, Image as ImageType, Message, Prisma, Profile, User } from '@/../prisma/client';
import { AppNotFoundError } from '@/lib/app-error';
import logger from '@/lib/logger';
import db from '@/lib/db';

const generatePaginationArgs = (
  filters: Types.BasePaginationFilters & { orderBy: 'createdAt' | 'updatedAt' },
  limit = 10
) => {
  return {
    ...(filters.cursor ? { cursor: { id: filters.cursor }, skip: 1 } : {}),
    orderBy: { [filters.orderBy]: filters.sort ?? 'desc' },
    take: filters.limit ?? limit,
  };
};

const generateMessageAggregation = () => {
  return {
    seenBy: { include: { profile: Utils.profileAggregation } },
    profile: Utils.profileAggregation,
    image: true,
  };
};

const generateChatAggregation = () => {
  return {
    profiles: { include: { profile: Utils.profileAggregation } },
    managers: { include: { profile: Utils.profileAggregation } },
    messages: {
      ...generatePaginationArgs({ orderBy: 'createdAt' }),
      include: generateMessageAggregation(),
    },
  };
};

const prepareMessage = (
  message: Prisma.MessageGetPayload<{
    include: { seenBy: { include: { profile: true } }; profile: true; image: true };
  }>,
  currentProfile: Profile
) => {
  if (currentProfile.tangible) {
    message.seenBy = message.seenBy.filter((sb) => sb.profile.tangible);
  } else {
    message.seenBy = message.seenBy.filter((sb) => sb.profile.id === currentProfile.id);
  }
  return message;
};

export const createChat = async (
  user: Types.PublicUser,
  data: Schema.ValidChat,
  imageData?: Types.ImageFullData,
  uploadedImage?: Storage.UploadedImageData
) => {
  return await Utils.handleDBKnownErrors(
    db.$transaction(async (tx) => {
      // Get current user's profile ID
      const currentProfile = await tx.profile.findUnique({
        where: { userId: user.id },
        include: { user: true },
      });
      if (!currentProfile) throw new AppNotFoundError('Profile not found');
      const profileId = currentProfile.id;
      const chatAggregation = generateChatAggregation();
      const messageArgs = {
        profileName: currentProfile.user.username,
        seenBy: { create: { profileId } },
        body: data.message.body,
        imageId:
          imageData && uploadedImage
            ? (
                await tx.image.create({
                  data: Image.getImageUpsertData(uploadedImage, imageData, user),
                })
              ).id
            : undefined,
        profileId,
      };
      // Combine all IDs, including the current user's one
      const profileIds = [currentProfile.id, ...data.profiles];
      // Find chats with the same owner and same group of profiles (there should be at most one)
      const existentChats = await tx.chat.findMany({
        where: {
          managers: { some: { profileId: currentProfile.id, role: 'OWNER' } },
          profiles: { every: { profileId: { in: profileIds } } },
        },
        include: chatAggregation,
      });
      // Upsert a chat
      let chat: Prisma.ChatGetPayload<{ include: typeof chatAggregation }>;
      if (existentChats.length > 0) {
        // Return the 1st found chat, and, if there are more than one chat found, delete the rest
        const selectedChatIndex = existentChats.findIndex((c) => c.messages.length > 0);
        const selectedChat = existentChats[selectedChatIndex > 0 ? selectedChatIndex : 0];
        if (existentChats.length > 1) {
          const chatIdsToDel: string[] = [];
          existentChats.forEach(({ id }, i) => i !== selectedChatIndex && chatIdsToDel.push(id));
          tx.chat.deleteMany({ where: { id: { in: chatIdsToDel } } }).catch(logger.error);
        }
        chat = await tx.chat.update({
          where: { id: selectedChat.id },
          data: { messages: { create: messageArgs } },
          include: chatAggregation,
        });
      } else {
        // Create new chat, because there are no chats for this group of profiles
        chat = await tx.chat.create({
          data: {
            managers: { create: { profileId: currentProfile.id, role: 'OWNER' } },
            profiles: {
              createMany: {
                data: profileIds.map((profileId) => ({ profileId })),
                skipDuplicates: true,
              },
            },
            messages: { create: { ...messageArgs, seenBy: { create: { profileId } } } },
          },
          include: chatAggregation,
        });
      }
      chat.messages = chat.messages.map((m) => prepareMessage(m, currentProfile));
      return chat;
    })
  );
};

export const deleteChat = async (userId: User['id'], chatId: Chat['id']) => {
  await Utils.handleDBKnownErrors(
    db.$transaction(async (tx) => {
      const chat = await tx.chat.findUnique({
        where: { id: chatId, profiles: { some: { profile: { userId } } } },
        include: { profiles: { include: { profile: true } } },
      });
      if (chat) {
        if (chat.profiles.length < 2) {
          await tx.chat.delete({ where: { id: chatId } });
        } else {
          const profile = chat.profiles.find((p) => p.profile.userId === userId);
          if (profile) {
            const { profileId } = profile;
            await tx.profilesChats.delete({ where: { profileId_chatId: { chatId, profileId } } });
          }
        }
      }
    })
  );
};

export const getUserChats = async (
  userId: User['id'],
  filters: Types.BasePaginationFilters = {}
) => {
  return await Utils.handleDBKnownErrors(
    db.$transaction(async (tx) => {
      const currentProfile = await tx.profile.findUnique({ where: { userId } });
      if (!currentProfile) throw new AppNotFoundError('Profile not found');
      const profileId = currentProfile.id;
      const chats = await tx.chat.findMany({
        ...generatePaginationArgs({ ...filters, orderBy: 'updatedAt' }),
        where: { profiles: { some: { profileId } } },
        include: generateChatAggregation(),
      });
      return chats.map((c) => {
        c.messages = c.messages.map((m) => prepareMessage(m, currentProfile));
        return c;
      });
    })
  );
};

export const getUserChatById = async (userId: User['id'], chatId: Chat['id']) => {
  return await Utils.handleDBKnownErrors(
    db.$transaction(async (tx) => {
      const currentProfile = await tx.profile.findUnique({ where: { userId } });
      if (!currentProfile) throw new AppNotFoundError('Profile not found');
      const profileId = currentProfile.id;
      const chat = await tx.chat.findUnique({
        where: { id: chatId, profiles: { some: { profileId } } },
        include: generateChatAggregation(),
      });
      if (!chat) throw new AppNotFoundError('Chat not found');
      chat.messages = chat.messages.map((m) => prepareMessage(m, currentProfile));
      return chat;
    })
  );
};

export const getUserChatMessages = async (
  userId: User['id'],
  chatId: Chat['id'],
  filters: Types.BasePaginationFilters = {}
) => {
  return await Utils.handleDBKnownErrors(
    db.$transaction(async (tx) => {
      const currentProfile = await tx.profile.findUnique({ where: { userId } });
      if (!currentProfile) throw new AppNotFoundError('Profile not found');
      const profileId = currentProfile.id;
      const messages = await tx.message.findMany({
        ...generatePaginationArgs({ ...filters, orderBy: 'createdAt' }),
        where: { chat: { id: chatId, profiles: { some: { profileId } } } },
        include: generateMessageAggregation(),
      });
      for (const { id } of messages) {
        const profileId_messageId = { messageId: id, profileId };
        await tx.profilesReceivedMessages.upsert({
          where: { profileId_messageId },
          create: profileId_messageId,
          update: profileId_messageId,
        });
      }
      return messages.map((m) => prepareMessage(m, currentProfile));
    })
  );
};

export const getUserChatMessageById = async (
  userId: User['id'],
  chatId: Chat['id'],
  msgId: Message['id']
) => {
  return await Utils.handleDBKnownErrors(
    db.$transaction(async (tx) => {
      const currentProfile = await tx.profile.findUnique({ where: { userId } });
      if (!currentProfile) throw new AppNotFoundError('Profile not found');
      const profileId = currentProfile.id;
      const msg = await tx.message.findUnique({
        where: { id: msgId, chat: { id: chatId, profiles: { some: { profileId } } } },
        include: generateMessageAggregation(),
      });
      if (!msg) throw new AppNotFoundError('Message not found');
      const profileId_messageId = { messageId: msg.id, profileId };
      await tx.profilesReceivedMessages.upsert({
        where: { profileId_messageId },
        create: profileId_messageId,
        update: profileId_messageId,
      });
      return prepareMessage(msg, currentProfile);
    })
  );
};

export const createUserChatMessage = async (
  user: Types.PublicUser,
  chatId: Chat['id'],
  { body }: Schema.ValidMessage,
  imageData?: Types.ImageFullData,
  uploadedImage?: Storage.UploadedImageData
) => {
  return await Utils.handleDBKnownErrors(
    db.$transaction(async (tx) => {
      const currentProfile = await tx.profile.findUnique({
        where: { userId: user.id },
        include: { user: true },
      });
      if (!currentProfile) throw new AppNotFoundError('Profile not found');
      const profileId = currentProfile.id;
      let imageId: ImageType['id'] | undefined;
      if (imageData && uploadedImage) {
        const image = await tx.image.create({
          data: Image.getImageUpsertData(uploadedImage, imageData, user),
        });
        imageId = image.id;
      }
      const msg = await tx.message.create({
        data: {
          profileName: currentProfile.user.username,
          seenBy: { create: { profileId } },
          profileId,
          imageId,
          chatId,
          body,
        },
        include: generateMessageAggregation(),
      });
      return prepareMessage(msg, currentProfile);
    })
  );
};

export const setSeenMessage = async (
  userId: User['id'],
  chatId: Chat['id'],
  messageId: Message['id']
) => {
  await Utils.handleDBKnownErrors(
    db.$transaction(async (tx) => {
      const profile = await tx.profile.findUnique({ where: { userId } });
      if (!profile) throw new AppNotFoundError('Profile not found');
      if (!(await db.message.findUnique({ where: { id: messageId, chatId } }))) {
        throw new AppNotFoundError('Message not found');
      }
      const profileId_messageId = { profileId: profile.id, messageId };
      await tx.profilesSeenMessages.upsert({
        where: { profileId_messageId },
        create: profileId_messageId,
        update: profileId_messageId,
      });
    })
  );
};
