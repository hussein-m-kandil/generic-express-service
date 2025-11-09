import * as Utils from '@/lib/utils';
import * as Schema from './chat.schema';
import { AppNotFoundError } from '@/lib/app-error';
import { User } from '@/../prisma/client';
import logger from '@/lib/logger';
import db from '@/lib/db';

const generatePaginationArgs = (take = 10) => {
  return { orderBy: { updatedAt: 'desc' as const }, take };
};

const generateChatAggregation = () => {
  return { messages: generatePaginationArgs() };
};

export const createChat = async (userId: User['id'], data: Schema.ValidChat) => {
  return await Utils.handleDBKnownErrors(
    db.$transaction(async (tx) => {
      // Get current user's profile ID
      const currentProfile = await tx.profile.findUnique({
        where: { userId },
        include: { user: true },
      });
      if (!currentProfile) throw new AppNotFoundError('Profile not found');
      const chatAggregation = generateChatAggregation();
      const messageArgs = {
        profileName: currentProfile.user.username,
        profileId: currentProfile.id,
        body: data.message,
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
      if (existentChats.length > 0) {
        // Return the 1st found chat, and, if there are more than one chat found, delete the rest
        const selectedChatIndex = existentChats.findIndex((c) => c.messages.length > 0);
        const selectedChat = existentChats[selectedChatIndex > 0 ? selectedChatIndex : 0];
        if (existentChats.length > 1) {
          const chatIdsToDel: string[] = [];
          existentChats.forEach(({ id }, i) => i !== selectedChatIndex && chatIdsToDel.push(id));
          tx.chat.deleteMany({ where: { id: { in: chatIdsToDel } } }).catch(logger.error);
        }
        return tx.chat.update({
          where: { id: selectedChat.id },
          data: { messages: { create: messageArgs } },
          include: chatAggregation,
        });
      } else {
        // Create new chat, because there are no chats for this group of profiles
        return await tx.chat.create({
          data: {
            managers: { create: { profileId: currentProfile.id, role: 'OWNER' } },
            profiles: {
              createMany: {
                data: profileIds.map((profileId) => ({ profileId })),
                skipDuplicates: true,
              },
            },
            messages: { create: messageArgs },
          },
          include: chatAggregation,
        });
      }
    })
  );
};
