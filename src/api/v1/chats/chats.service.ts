import * as Types from '@/types';
import * as Utils from '@/lib/utils';
import * as Image from '@/lib/image';
import * as Schema from './chat.schema';
import * as Storage from '@/lib/storage';
import { Chat, Image as ImageType, Message, Prisma, Profile, User } from '@/../prisma/client';
import { AppNotFoundError } from '@/lib/app-error';
import logger from '@/lib/logger';
import db from '@/lib/db';

const createPaginationArgs = (
  filters: Types.BasePaginationFilters & { orderBy: 'createdAt' | 'updatedAt' },
  limit = 10,
) => {
  return {
    ...(filters.cursor ? { cursor: { id: filters.cursor }, skip: 1 } : {}),
    orderBy: { [filters.orderBy]: filters.sort ?? 'desc' },
    take: filters.limit ?? limit,
  };
};

const createMessageAggregation = () => {
  return { profile: Utils.profileAggregation, image: true } as const;
};

const createChatAggregation = () => {
  return {
    profiles: { include: { profile: Utils.profileAggregation } },
    managers: { include: { profile: Utils.profileAggregation } },
    messages: {
      ...createPaginationArgs({ orderBy: 'createdAt' }),
      include: createMessageAggregation(),
    },
  };
};

const createCurrentProfileChatArgs = (
  currentProfile: Prisma.ProfileGetPayload<{ include: { user: true } }>,
  now: Date,
) => {
  return {
    profileName: currentProfile.user.username,
    profileId: currentProfile.id,
    lastReceivedAt: now,
    lastSeenAt: now,
  };
};

const prepareChat = (
  chat: Prisma.ChatGetPayload<{ include: ReturnType<typeof createChatAggregation> }>,
  currentProfile: Profile,
) => {
  if (currentProfile.tangible) {
    chat.profiles = chat.profiles.map((p) => {
      if ((currentProfile.tangible && p.profile?.tangible) || p.profileId === currentProfile.id) {
        return p;
      }
      return { ...p, lastSeenAt: null };
    });
  } else {
    chat.profiles = chat.profiles.map((p) =>
      p.profileId === currentProfile.id ? p : { ...p, lastSeenAt: null },
    );
  }
  return chat;
};

export const createChat = async (
  user: Types.PublicUser,
  data: Schema.ValidChat,
  imageData?: Types.ImageFullData,
  uploadedImage?: Storage.UploadedImageData,
) => {
  return await Utils.handleDBKnownErrors(
    db.$transaction(async (tx) => {
      const allProfiles = await tx.profile.findMany({
        where: { OR: [{ id: { in: data.profiles } }, { userId: user.id }] },
        include: { user: true },
        distinct: 'id',
      });
      const otherProfiles: typeof allProfiles = [];
      const currentProfile = allProfiles.reduce<(typeof allProfiles)[number] | null>(
        (acc, curr) => (curr.user.id === user.id ? curr : (otherProfiles.push(curr), acc)),
        null,
      );
      if (!currentProfile) throw new AppNotFoundError('Profile not found');
      const currentProfileChatArgs = createCurrentProfileChatArgs(currentProfile, new Date());
      const chatAggregation = createChatAggregation();
      const messageArgs = {
        profileName: currentProfile.user.username,
        body: data.message.body,
        imageId:
          imageData && uploadedImage
            ? (
                await tx.image.create({
                  data: Image.getImageUpsertData(uploadedImage, imageData, user),
                })
              ).id
            : undefined,
        profileId: currentProfile.id,
      };
      // Find chats with the same owner and same group of profiles (there should be at most one)
      const existentChats = (
        await tx.chat.findMany({
          where: {
            managers: { some: { profileId: currentProfile.id, role: 'OWNER' } },
            profiles: { every: { profileName: { in: allProfiles.map((p) => p.user.username) } } },
          },
          include: { ...chatAggregation, _count: { select: { profiles: true } } },
        })
      ).filter((c) => c._count.profiles === allProfiles.length); // Filter out the profiles with a mismatched count.
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
          data: {
            messages: { create: messageArgs },
            profiles: {
              update: {
                where: {
                  profileName_chatId: {
                    profileName: currentProfile.user.username,
                    chatId: selectedChat.id,
                  },
                },
                data: currentProfileChatArgs,
              },
            },
          },
          include: chatAggregation,
        });
      } else {
        // Create new chat, because there are no chats for this group of profiles
        chat = await tx.chat.create({
          data: {
            managers: { create: { profileId: currentProfile.id, role: 'OWNER' } },
            profiles: {
              createMany: {
                data: [
                  currentProfileChatArgs,
                  ...otherProfiles.map((p) => ({ profileName: p.user.username, profileId: p.id })),
                ],
                skipDuplicates: true,
              },
            },
            messages: { create: messageArgs },
          },
          include: chatAggregation,
        });
      }
      return prepareChat(chat, currentProfile);
    }),
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
          let profileName: string | undefined;
          const otherMembersIds: string[] = [];
          for (const cp of chat.profiles) {
            if (!profileName && cp.profile?.userId === userId) profileName = cp.profileName;
            else if (cp.profileId) otherMembersIds.push(cp.profileId);
          }
          if (profileName) {
            await tx.profilesChats.delete({
              where: { profileName_chatId: { chatId, profileName } },
            });
          }
        }
      }
    }),
  );
};

export const getUserChats = async (
  userId: User['id'],
  filters: Types.BasePaginationFilters = {},
) => {
  return await Utils.handleDBKnownErrors(
    db.$transaction(async (tx) => {
      const currentProfile = await tx.profile.findUnique({ where: { userId } });
      if (!currentProfile) throw new AppNotFoundError('Profile not found');
      const profileId = currentProfile.id;
      const chatIds = await tx.chat.findMany({
        where: { profiles: { some: { profileId } } },
        select: { id: true },
      });
      await tx.profilesChats.updateMany({
        where: { chatId: { in: chatIds.map((c) => c.id) }, profile: { userId } },
        data: { lastReceivedAt: new Date() },
      });
      const chats = await tx.chat.findMany({
        ...createPaginationArgs({ ...filters, orderBy: 'updatedAt' }),
        where: { profiles: { some: { profileId } } },
        include: createChatAggregation(),
      });
      return chats.map((chat) => prepareChat(chat, currentProfile));
    }),
  );
};

export const getUserChatById = async (userId: User['id'], chatId: Chat['id']) => {
  return await Utils.handleDBKnownErrors(
    db.$transaction(async (tx) => {
      const currentProfile = await tx.profile.findUnique({
        where: { userId },
        include: { user: true },
      });
      if (!currentProfile) throw new AppNotFoundError('Profile not found');
      const profileId = currentProfile.id;
      let chat;
      try {
        await tx.profilesChats.update({
          where: { profileName_chatId: { chatId, profileName: currentProfile.user.username } },
          data: { lastReceivedAt: new Date() },
        });
        chat = await tx.chat.findUnique({
          where: { id: chatId, profiles: { some: { profileId } } },
          include: createChatAggregation(),
        });
        if (!chat) throw new AppNotFoundError('Chat not found');
      } catch {
        throw new AppNotFoundError('Chat not found');
      }
      return prepareChat(chat, currentProfile);
    }),
  );
};

export const getOtherChatMemberIds = async (userId: User['id'], chatId: Chat['id']) => {
  const chat = await db.chat.findUnique({
    where: { id: chatId },
    select: { profiles: { select: { profile: true } } },
  });
  const otherMembersIds: string[] = [];
  if (chat) {
    for (const { profile } of chat.profiles) {
      if (profile && profile.userId !== userId) otherMembersIds.push(profile.id);
    }
  }
  return otherMembersIds;
};

export const getOtherChatsMemberIds = (
  userId: User['id'],
  chats: Awaited<ReturnType<typeof getUserChats>>,
) => {
  const chatsMemberIds: string[] = [];
  for (const chat of chats) {
    for (const { profile } of chat.profiles) {
      if (profile && profile.userId !== userId) chatsMemberIds.push(profile.id);
    }
  }
  return chatsMemberIds;
};

export const getUserChatsByMember = async (userId: User['id'], memberIdOrUsername: string) => {
  return await Utils.handleDBKnownErrors(
    db.$transaction(async (tx) => {
      let profileId: Profile['id'];
      try {
        const memberUser = await tx.user.findUnique({
          where: { username: memberIdOrUsername },
          include: { profile: true },
        });
        const memberProfile =
          memberUser?.profile ??
          (await tx.profile.findUnique({ where: { id: memberIdOrUsername } }));
        if (!memberProfile) throw new AppNotFoundError('Chat member profile not found');
        profileId = memberProfile.id;
      } catch {
        throw new AppNotFoundError('Chat member profile not found');
      }
      await tx.profilesChats.updateManyAndReturn({
        where: {
          profile: { userId },
          chat: {
            AND: [
              { profiles: { some: { profileId } } },
              { profiles: { some: { profile: { userId } } } },
            ],
          },
        },
        data: { lastReceivedAt: new Date() },
      });
      const currentProfileWithChats = await tx.profile.findUnique({
        where: { userId },
        include: {
          chats: {
            where: { chat: { profiles: { some: { profileId } } } },
            include: { chat: { include: createChatAggregation() } },
          },
        },
      });
      if (!currentProfileWithChats) throw new AppNotFoundError('Profile not found');
      return currentProfileWithChats.chats.map((c) => prepareChat(c.chat, currentProfileWithChats));
    }),
  );
};

export const getUserChatMessages = async (
  userId: User['id'],
  chatId: Chat['id'],
  filters: Types.BasePaginationFilters = {},
) => {
  return await Utils.handleDBKnownErrors(
    db.$transaction(async (tx) => {
      const currentProfile = await tx.profile.findUnique({
        where: { userId },
        include: { user: true },
      });
      if (!currentProfile) throw new AppNotFoundError('Profile not found');
      const profileName = currentProfile.user.username;
      const profileId = currentProfile.id;
      let chat;
      try {
        chat = await tx.chat.findUnique({ where: { id: chatId } });
        if (!chat) throw new AppNotFoundError('Chat not found');
      } catch {
        throw new AppNotFoundError('Chat not found');
      }
      await tx.profilesChats.update({
        where: { profileName_chatId: { profileName, chatId } },
        data: { lastReceivedAt: new Date() },
      });
      return await tx.message.findMany({
        ...createPaginationArgs({ ...filters, orderBy: 'createdAt' }),
        where: { chat: { id: chatId, profiles: { some: { profileId } } } },
        include: createMessageAggregation(),
      });
    }),
  );
};

export const getUserChatMessageById = async (
  userId: User['id'],
  chatId: Chat['id'],
  msgId: Message['id'],
) => {
  return await Utils.handleDBKnownErrors(
    db.$transaction(async (tx) => {
      const currentProfile = await tx.profile.findUnique({
        where: { userId },
        include: { user: true },
      });
      if (!currentProfile) throw new AppNotFoundError('Profile not found');
      const profileName = currentProfile.user.username;
      const profileId = currentProfile.id;
      await tx.profilesChats.update({
        where: { profileName_chatId: { profileName, chatId } },
        data: { lastReceivedAt: new Date() },
      });
      const message = await tx.message.findUnique({
        where: { id: msgId, chat: { id: chatId, profiles: { some: { profileId } } } },
        include: { ...createMessageAggregation() },
      });
      if (!message) throw new AppNotFoundError('Message not found');
      return message;
    }),
  );
};

export const createUserChatMessage = async (
  user: Types.PublicUser,
  chatId: Chat['id'],
  { body }: Schema.ValidMessage,
  imageData?: Types.ImageFullData,
  uploadedImage?: Storage.UploadedImageData,
) => {
  return await Utils.handleDBKnownErrors(
    db.$transaction(async (tx) => {
      const currentProfile = await tx.profile.findUnique({
        where: { userId: user.id },
        include: { user: true },
      });
      if (!currentProfile) throw new AppNotFoundError('Profile not found');
      const profileName = currentProfile.user.username;
      const profileId = currentProfile.id;
      let imageId: ImageType['id'] | undefined;
      if (imageData && uploadedImage) {
        const image = await tx.image.create({
          data: Image.getImageUpsertData(uploadedImage, imageData, user),
        });
        imageId = image.id;
      }
      const now = new Date();
      await tx.chat.update({
        where: { id: chatId },
        data: {
          updatedAt: now,
          profiles: {
            update: {
              where: { profileName_chatId: { profileName, chatId } },
              data: createCurrentProfileChatArgs(currentProfile, now),
            },
          },
        },
      });
      return await tx.message.create({
        data: {
          profileName: currentProfile.user.username,
          profileId,
          imageId,
          chatId,
          body,
        },
        include: createMessageAggregation(),
      });
    }),
  );
};

export const updateProfileChatLastSeenDate = async (userId: User['id'], chatId: Chat['id']) => {
  const now = new Date();
  await Utils.handleDBKnownErrors(
    db.$transaction(async (tx) => {
      const currentProfile = await tx.profile.findUnique({
        where: { userId },
        include: { user: true },
      });
      if (!currentProfile) throw new AppNotFoundError('Profile not found');
      const profileName = currentProfile.user.username;
      await tx.profilesChats.update({
        where: { profileName_chatId: { profileName, chatId } },
        data: { lastSeenAt: now },
      });
    }),
  );
  return now;
};
