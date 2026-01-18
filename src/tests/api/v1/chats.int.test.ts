/* eslint-disable security/detect-object-injection */
import * as Types from '@/types';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { Prisma, Chat, Message } from '@/../prisma/client';
import { CHATS_URL, SIGNIN_URL } from './utils';
import { faker } from '@faker-js/faker';
import setup from '@/tests/api/setup';
import db from '@/lib/db';
import fs from 'node:fs';

interface MessageIncludeFields {
  seenBy: { include: { profile: { include: { user: true } } } };
  profile: { include: { user: true } };
  image: true;
}

type ChatFullData = Prisma.ChatGetPayload<{
  include: {
    messages: { include: MessageIncludeFields };
    profiles: { include: { profile: { include: { user: true } } } };
    managers: { include: { profile: { include: { user: true } } } };
  };
}>;

type ChatWithProfiles = Prisma.ChatGetPayload<{ include: { profiles: true } }>;

type MessageFullData = Prisma.MessageGetPayload<{ include: MessageIncludeFields }>;

const PAGE_LEN = 10;
const EXTRA_LEN = 3;
const ITEMS_LEN = PAGE_LEN + EXTRA_LEN;

const assertMessage = (msg: MessageFullData, expectedMsgId: Message['id']) => {
  expect(msg.id).toBe(expectedMsgId);
  expect(msg.profileName).toBeTruthy();
  expect(msg.profile!.user.username).toBeTruthy();
  expect(msg.profileName).toBe(msg.profile!.user.username);
  if (msg.image) expect(msg.image).not.toHaveProperty('owner');
};

const assertChat = (
  chat: ChatFullData,
  expectedChatId: Chat['id'],
  msgCount = PAGE_LEN,
  profilesCount = 2,
) => {
  expect(chat.id).toBe(expectedChatId);
  expect(chat.managers).toBeInstanceOf(Array);
  expect(chat.managers).toHaveLength(1);
  expect(chat.profiles).toBeInstanceOf(Array);
  expect(chat.profiles).toHaveLength(profilesCount);
  expect(chat.messages).toBeInstanceOf(Array);
  expect(chat.messages).toHaveLength(msgCount);
  for (const manager of chat.managers) {
    expect(manager.profile.user.password).toBeUndefined();
    expect(manager.profile.user.username).toBeTruthy();
  }
  for (const member of chat.profiles) {
    expect(member.profile!.user.password).toBeUndefined();
    expect(member.profile!.user.username).toBeTruthy();
  }
  for (const msg of chat.messages) assertMessage(msg, msg.id);
};

const assertChatMembersTangibility = (chat: ChatFullData) => {
  for (const member of chat.profiles) {
    expect(member.lastReceivedAt).toBeTruthy();
    if (member.profile?.tangible) {
      expect(member.lastSeenAt).toBeTruthy();
    } else {
      expect(member.lastSeenAt).toBeNull();
    }
  }
};

const assertReceivedDateUpdated = (
  newChat: ChatWithProfiles,
  oldChat: ChatWithProfiles,
  receiverName: string,
) => {
  for (const newChatMember of newChat.profiles) {
    const oldChatMember = oldChat.profiles.find(
      (p) => p.profileName === newChatMember.profileName,
    )!;
    if (newChatMember.profileName === receiverName) {
      expect(new Date(oldChatMember.lastReceivedAt!).getTime()).toBeLessThan(
        new Date(newChatMember.lastReceivedAt!).getTime(),
      );
    } else {
      expect(new Date(oldChatMember.lastReceivedAt!).getTime()).toBe(
        new Date(newChatMember.lastReceivedAt!).getTime(),
      );
    }
  }
};

const assertSeenDateUpdated = async (chat: ChatWithProfiles, receiverName: string) => {
  for (const member of chat.profiles) {
    const dbMember = (await db.profilesChats.findUnique({
      where: { profileName_chatId: { profileName: member.profileName, chatId: chat.id } },
    }))!;
    if (member.profileName === receiverName) {
      expect(dbMember.lastSeenAt!.getTime()).toBeGreaterThan(
        new Date(member.lastSeenAt!).getTime(),
      );
    } else {
      expect(dbMember.lastSeenAt!.getTime()).toBe(new Date(member.lastSeenAt!).getTime());
    }
  }
};

describe('Chats endpoints', async () => {
  const {
    userOneData,
    userTwoData,
    storageData,
    xUserData,
    imagedata,
    dbUserOne,
    dbUserTwo,
    dbXUser,
    dbAdmin,
    imgData,
    api,
    createUser,
    createImage,
    deleteAllUsers,
    deleteAllImages,
    assertImageData,
    prepForAuthorizedTest,
    assertNotFoundErrorRes,
    assertUnauthorizedErrorRes,
    assertResponseWithValidationError,
  } = await setup(SIGNIN_URL);

  const { storage } = storageData;

  afterEach(vi.clearAllMocks);

  afterAll(async () => {
    await db.chat.deleteMany({});
    await deleteAllImages();
    await deleteAllUsers();
  });

  const createFakeUser = (usernameBlacklist: string[] = [], data: Record<string, unknown> = {}) => {
    const password = typeof data.password === 'string' ? data.password : faker.internet.password();
    const fullname = typeof data.fullName === 'string' ? data.fullName : faker.person.fullName();
    let username: string;
    if (typeof data.username === 'string') username = data.username;
    else {
      username = faker.person.firstName();
      do {
        username = faker.person.firstName();
      } while (usernameBlacklist.includes(username));
    }
    return createUser({ username, fullname, password, profile: { create: { tangible: false } } });
  };

  const createChat = async (msg = 'Hi!', users = [dbUserOne, dbUserTwo], withImage = true) => {
    const profileName = users[0].username;
    const profileId = users[0].profile!.id;
    const imageId = msg && withImage ? (await createImage(imgData)).id : undefined;
    return await db.chat.create({
      data: {
        profiles: {
          createMany: {
            data: users.map((u) => ({
              profileName: u.username,
              profileId: u.profile!.id,
              lastReceivedAt: new Date(),
              lastSeenAt: new Date(),
            })),
          },
        },
        managers: { create: { profileId: users[0].profile!.id, role: 'OWNER' } },
        ...(msg ? { messages: { create: { body: msg, profileId, profileName, imageId } } } : {}),
      },
      include: { profiles: true, managers: true, messages: true },
    });
  };

  const createMessage = async (chatId: Chat['id'], dbUser: typeof dbUserOne, withImage = true) => {
    const profileId = dbUser.profile!.id;
    return db.message.create({
      data: {
        imageId: withImage ? (await createImage(imgData)).id : undefined,
        profileName: dbUser.username,
        body: faker.lorem.sentence(),
        profileId,
        chatId,
      },
    });
  };

  const dbUsers = [dbUserTwo, dbXUser, dbAdmin];
  const usedUsernames: string[] = [];
  for (let i = 0; i < ITEMS_LEN; i++) {
    dbUsers[i] = dbUsers[i] ?? (await createFakeUser(usedUsernames));
    usedUsernames.push(dbUsers[i].username);
  }

  const intangibleUserData = {
    password: faker.internet.password(),
    fullname: 'Intangible User',
    username: 'intangible_user',
    profile: { create: { tangible: false } },
  };

  describe('GET', () => {
    const dbChats: Awaited<ReturnType<typeof createChat>>[] = [];
    const dbMsgs: Message[] = [];

    beforeAll(async () => {
      await db.chat.deleteMany({});
      for (const dbUser of dbUsers) {
        // Ignore the initial, chat-owner message to be added with the other messages
        const chat = await createChat('', [dbUserOne, dbUser]);
        for (let j = 0; j < ITEMS_LEN; j++) {
          dbMsgs.push(await createMessage(chat.id, dbUsers[j]));
        }
        dbChats.push(chat);
      }
    });

    describe(CHATS_URL, () => {
      it('should respond with 401 on unauthorized request', async () => {
        const res = await api.get(CHATS_URL);
        assertUnauthorizedErrorRes(res);
      });

      it('should respond desc-paginated chats with their profiles, managers, and 1st messages page', async () => {
        const pages = [{ len: PAGE_LEN }, { len: EXTRA_LEN }];
        let firstChat: ChatFullData | undefined;
        let cursor: Chat['id'] | undefined;
        for (const page of pages) {
          const { authorizedApi } = await prepForAuthorizedTest(userOneData);
          const res = await authorizedApi.get(`${CHATS_URL}${cursor ? '?cursor=' + cursor : ''}`);
          const resBody = res.body as ChatFullData[];
          cursor = resBody.at(-1)!.id;
          firstChat ??= resBody[0];
          expect(res.statusCode).toBe(200);
          expect(res.type).toMatch(/json/);
          expect(resBody).toBeInstanceOf(Array);
          expect(resBody).toHaveLength(page.len);
          for (const c of resBody) {
            assertChat(c, c.id);
            assertChatMembersTangibility(c);
            const dbChat = dbChats.find((dbc) => dbc.id === c.id)!;
            assertReceivedDateUpdated(c, dbChat, userOneData.username);
          }
        }
        expect(firstChat!.id).toBe(dbChats.at(-1)!.id);
      });

      it('should respond custom-asc-paginated chats with their profiles, managers, and 1st messages page', async () => {
        let firstChat: ChatFullData | undefined;
        let cursor: Chat['id'] | undefined;
        const limit = 2;
        const pages: { len: number }[] = Array.from({ length: Math.ceil(ITEMS_LEN / limit) }).map(
          (_, i, arr) => ({ len: i < arr.length - 1 ? limit : ITEMS_LEN - i * limit }),
        );
        for (const page of pages) {
          const { authorizedApi } = await prepForAuthorizedTest(userOneData);
          const res = await authorizedApi.get(
            `${CHATS_URL}?sort=asc&limit=${limit}${cursor ? '&cursor=' + cursor : ''}`,
          );
          const resBody = res.body as ChatFullData[];
          cursor = resBody.at(-1)!.id;
          firstChat ??= resBody[0];
          expect(res.statusCode).toBe(200);
          expect(res.type).toMatch(/json/);
          expect(resBody).toBeInstanceOf(Array);
          expect(resBody).toHaveLength(page.len);
          for (const c of resBody) {
            assertChat(c, c.id);
            assertChatMembersTangibility(c);
            const dbChat = dbChats.find((dbc) => dbc.id === c.id)!;
            assertReceivedDateUpdated(c, dbChat, userOneData.username);
          }
        }
        expect(firstChat!.id).toBe(dbChats[0].id);
      });
    });

    describe(`${CHATS_URL}/members/:profileId`, () => {
      it('should respond with 401 on unauthorized request', async () => {
        const res = await api.get(`${CHATS_URL}/members/${crypto.randomUUID()}`);
        assertUnauthorizedErrorRes(res);
      });

      it('should respond with 404 if the given member id is not exist', async () => {
        const { authorizedApi } = await prepForAuthorizedTest(userOneData);
        const res = await authorizedApi.get(`${CHATS_URL}/members/${crypto.randomUUID()}`);
        assertNotFoundErrorRes(res);
      });

      it('should respond all the current user chats that include the given member`s profile id', async () => {
        const memberProfileId = dbUserTwo.profile!.id;
        const dbChatId1 = dbChats.find((c) =>
          c.profiles.some((p) => p.profileId === memberProfileId),
        )!.id;
        const dbChat1 = (await db.chat.findUnique({
          where: { id: dbChatId1 },
          include: { profiles: true },
        }))!;
        const dbChat2 = await createChat('Hello #2', [dbUserOne, dbUserTwo, dbXUser]);
        const { authorizedApi } = await prepForAuthorizedTest(userOneData);
        const res = await authorizedApi.get(`${CHATS_URL}/members/${memberProfileId}`);
        const resBody = res.body as ChatFullData[];
        expect(res.statusCode).toBe(200);
        expect(res.type).toMatch(/json/);
        expect(resBody).toBeInstanceOf(Array);
        expect(resBody).toHaveLength(2);
        expect(resBody.every((c) => c.id === dbChat1.id || c.id === dbChat2.id)).toBe(true);
        for (const c of resBody) {
          if (c.id === dbChat2.id) assertChat(c, c.id, 1, 3);
          else assertChat(c, c.id);
          assertChatMembersTangibility(c);
        }
        assertReceivedDateUpdated(resBody[0], dbChat1, userOneData.username);
        assertReceivedDateUpdated(resBody[1], dbChat2, userOneData.username);
      });
    });

    describe(`${CHATS_URL}/:id`, () => {
      it('should respond with 401 on unauthorized request', async () => {
        const res = await api.get(`${CHATS_URL}/${dbChats[0].id}`);
        assertUnauthorizedErrorRes(res);
      });

      it('should respond with 404 on unknown chat id', async () => {
        const { authorizedApi } = await prepForAuthorizedTest(userOneData);
        const res = await authorizedApi.get(`${CHATS_URL}/${crypto.randomUUID()}`);
        assertNotFoundErrorRes(res);
      });

      it('should respond with 404 if the current user not a chat member', async () => {
        const chat = dbChats[0];
        const password = faker.internet.password();
        const { id, username } = await createFakeUser(usedUsernames, { password });
        const { authorizedApi } = await prepForAuthorizedTest({ username, password });
        const res = await authorizedApi.get(`${CHATS_URL}/${chat.id}`);
        assertNotFoundErrorRes(res);
        await db.user.delete({ where: { id } });
      });

      it('should respond with 200 and the requested chat', async () => {
        const chat = (await db.chat.findUnique({
          where: { id: dbChats[0].id },
          include: { profiles: true },
        }))!;
        const { authorizedApi } = await prepForAuthorizedTest(userOneData);
        const res = await authorizedApi.get(`${CHATS_URL}/${chat.id}`);
        const resBody = res.body as ChatFullData;
        expect(res.statusCode).toBe(200);
        expect(res.type).toMatch(/json/);
        assertChat(resBody, chat.id);
        assertChatMembersTangibility(resBody);
        assertReceivedDateUpdated(resBody, chat, userOneData.username);
      });
    });

    describe(`${CHATS_URL}/:id/messages`, () => {
      it('should respond with 401 on unauthorized request', async () => {
        const res = await api.get(`${CHATS_URL}/${dbChats[0].id}/messages`);
        assertUnauthorizedErrorRes(res);
      });

      it('should respond with 404 and an empty array on unknown chat id', async () => {
        const { authorizedApi } = await prepForAuthorizedTest(userOneData);
        const res = await authorizedApi.get(`${CHATS_URL}/${crypto.randomUUID()}/messages`);
        assertNotFoundErrorRes(res);
      });

      it('should respond with 404 if the current user not a chat member', async () => {
        const chat = dbChats[0];
        const password = faker.internet.password();
        const { id, username } = await createFakeUser(usedUsernames, { password });
        const { authorizedApi } = await prepForAuthorizedTest({ username, password });
        const res = await authorizedApi.get(`${CHATS_URL}/${chat.id}/messages`);
        assertNotFoundErrorRes(res);
        await db.user.delete({ where: { id } });
      });

      it('should respond with 200 and a desc-paginated messages with their profiles, seen-by, and images', async () => {
        const pages = [{ len: PAGE_LEN }, { len: EXTRA_LEN }];
        let firstMessage: MessageFullData | undefined;
        let cursor: Message['id'] | undefined;
        const chat = dbChats[0];
        for (const page of pages) {
          const { authorizedApi } = await prepForAuthorizedTest(userOneData);
          const res = await authorizedApi.get(
            `${CHATS_URL}/${chat.id}/messages${cursor ? '?cursor=' + cursor : ''}`,
          );
          const resBody = res.body as MessageFullData[];
          cursor = resBody.at(-1)!.id;
          firstMessage ??= resBody[0];
          expect(res.statusCode).toBe(200);
          expect(res.type).toMatch(/json/);
          expect(resBody).toBeInstanceOf(Array);
          expect(resBody).toHaveLength(page.len);
          resBody.forEach((m) => assertMessage(m, m.id));
        }
        expect(firstMessage?.id).toBe(dbMsgs.at(ITEMS_LEN - 1)!.id);
        const updatedChat = (await db.chat.findUnique({
          where: { id: chat.id },
          include: { profiles: true },
        }))!;
        assertReceivedDateUpdated(updatedChat, chat, userOneData.username);
      });

      it('should respond with 200 and a custom-asc-paginated messages with their profiles, seen-by and images', async () => {
        let firstMessage: MessageFullData | undefined;
        let cursor: Message['id'] | undefined;
        const chat = dbChats[0];
        const limit = 2;
        const pages: { len: number }[] = Array.from({ length: Math.ceil(ITEMS_LEN / limit) }).map(
          (_, i, arr) => ({ len: i < arr.length - 1 ? limit : ITEMS_LEN - i * limit }),
        );
        for (const page of pages) {
          const { authorizedApi } = await prepForAuthorizedTest(userOneData);
          const res = await authorizedApi.get(
            `${CHATS_URL}/${chat.id}/messages?sort=asc&limit=${limit}${
              cursor ? '&cursor=' + cursor : ''
            }`,
          );
          const resBody = res.body as MessageFullData[];
          cursor = resBody.at(-1)!.id;
          firstMessage ??= resBody[0];
          expect(res.statusCode).toBe(200);
          expect(res.type).toMatch(/json/);
          expect(resBody).toBeInstanceOf(Array);
          expect(resBody).toHaveLength(page.len);
          resBody.forEach((m) => assertMessage(m, m.id));
        }
        expect(firstMessage!.id).toBe(dbMsgs[0].id);
        const updatedChat = (await db.chat.findUnique({
          where: { id: chat.id },
          include: { profiles: true },
        }))!;
        assertReceivedDateUpdated(updatedChat, chat, userOneData.username);
      });
    });

    describe(`${CHATS_URL}/:id/messages/:msgId`, () => {
      it('should respond with 401 on unauthorized request', async () => {
        const chat = dbChats[0];
        const msg = dbMsgs[0];
        const res = await api.get(`${CHATS_URL}/${chat.id}/messages/${msg.id}`);
        assertUnauthorizedErrorRes(res);
      });

      it('should respond with 404 on unknown chat id', async () => {
        const chat = { id: crypto.randomUUID() };
        const msg = dbMsgs[0];
        const { authorizedApi } = await prepForAuthorizedTest(userOneData);
        const res = await authorizedApi.get(`${CHATS_URL}/${chat.id}/messages/${msg.id}`);
        assertNotFoundErrorRes(res);
      });

      it('should respond with 404 on unknown message id', async () => {
        const chat = dbChats[0];
        const msg = { id: crypto.randomUUID() };
        const { authorizedApi } = await prepForAuthorizedTest(userOneData);
        const res = await authorizedApi.get(`${CHATS_URL}/${chat.id}/messages/${msg.id}`);
        assertNotFoundErrorRes(res);
      });

      it('should respond with 404 if the current user not a chat member', async () => {
        const chat = dbChats[0];
        const msg = dbMsgs[0];
        const password = faker.internet.password();
        const { id, username } = await createFakeUser(usedUsernames, { password });
        const { authorizedApi } = await prepForAuthorizedTest({ username, password });
        const res = await authorizedApi.get(`${CHATS_URL}/${chat.id}/messages/${msg.id}`);
        assertNotFoundErrorRes(res);
        await db.user.delete({ where: { id } });
      });

      it('should respond with 200 and a message', async () => {
        const chat = dbChats[0];
        const msg = dbMsgs[0];
        const { authorizedApi } = await prepForAuthorizedTest(userOneData);
        const res = await authorizedApi.get(`${CHATS_URL}/${chat.id}/messages/${msg.id}`);
        const updatedChat = (await db.chat.findUnique({
          where: { id: chat.id },
          include: { profiles: true },
        }))!;
        expect(res.statusCode).toBe(200);
        expect(res.type).toMatch(/json/);
        assertMessage(res.body as MessageFullData, msg.id);
        assertReceivedDateUpdated(updatedChat, chat, userOneData.username);
      });
    });
  });

  describe(`POST ${CHATS_URL}/:id/messages`, () => {
    let dbChat: Awaited<ReturnType<typeof createChat>>;
    const msgData = { body: "What's up?" };

    beforeAll(async () => {
      await db.chat.deleteMany({});
      dbChat = await createChat('', [dbUserOne, dbUserTwo]);
    });

    afterAll(async () => {
      await db.chat.deleteMany({});
    });

    afterEach(async () => {
      await db.message.deleteMany({});
      await deleteAllImages();
    });

    it('should respond with 401 on unauthorized request', async () => {
      const res = await api.post(`${CHATS_URL}/${dbChat.id}/messages`).send(msgData);
      assertUnauthorizedErrorRes(res);
      expect(await db.message.findMany({})).toHaveLength(0);
    });

    it('should respond with 400 on request without message data', async () => {
      const { authorizedApi } = await prepForAuthorizedTest(userOneData);
      const res = await authorizedApi.post(`${CHATS_URL}/${dbChat.id}/messages`);
      expect(await db.message.findMany({})).toHaveLength(0);
      assertResponseWithValidationError(res);
    });

    it('should respond with 400 on request without message body', async () => {
      const { authorizedApi } = await prepForAuthorizedTest(userOneData);
      const res = await authorizedApi.post(`${CHATS_URL}/${dbChat.id}/messages`).send({});
      assertResponseWithValidationError(res, 'body');
      expect(await db.message.findMany({})).toHaveLength(0);
    });

    it('should respond with 404 on non-existent chat id', async () => {
      const { authorizedApi } = await prepForAuthorizedTest(userOneData);
      const res = await authorizedApi
        .post(`${CHATS_URL}/${crypto.randomUUID()}/messages`)
        .send(msgData);
      assertNotFoundErrorRes(res);
      expect(await db.message.findMany({})).toHaveLength(0);
    });

    it('should respond with 400 on request with invalid image type', async () => {
      const stream = fs.createReadStream('src/tests/files/ugly.txt');
      const preparedImgData = Object.fromEntries(
        Object.entries(imagedata).map(([k, v]) => [`imagedata[${k}]`, v]),
      );
      const { authorizedApi } = await prepForAuthorizedTest(userOneData);
      const res = await authorizedApi
        .post(`${CHATS_URL}/${dbChat.id}/messages`)
        .field(msgData)
        .field(preparedImgData)
        .attach('image', stream);
      const resBody = res.body as Types.AppErrorResponse;
      expect(res.type).toMatch(/json/);
      expect(res.statusCode).toBe(400);
      expect(resBody.error.message).toMatch(/invalid image/i);
      expect(storage.upload).not.toHaveBeenCalledOnce();
    });

    it('should respond with 400 on request with too large image file', async () => {
      const stream = fs.createReadStream('src/tests/files/bad.jpg');
      const preparedImgData = Object.fromEntries(
        Object.entries(imagedata).map(([k, v]) => [`imagedata[${k}]`, v]),
      );
      const { authorizedApi } = await prepForAuthorizedTest(userOneData);
      const res = await authorizedApi
        .post(`${CHATS_URL}/${dbChat.id}/messages`)
        .field(msgData)
        .field(preparedImgData)
        .attach('image', stream);
      const resBody = res.body as Types.AppErrorResponse;
      expect(res.type).toMatch(/json/);
      expect(res.statusCode).toBe(400);
      expect(resBody.error.message).toMatch(/too large/i);
      expect(storage.upload).not.toHaveBeenCalledOnce();
    });

    it('should respond with 201 and create message, and update the sender profile chat-last-received/seen date', async () => {
      const { authorizedApi } = await prepForAuthorizedTest(userOneData);
      const res = await authorizedApi.post(`${CHATS_URL}/${dbChat.id}/messages`).send(msgData);
      const updatedDBChat = (await db.chat.findUnique({
        where: { id: dbChat.id },
        include: { profiles: true },
      }))!;
      const dbMsgs = await db.message.findMany({});
      const resBody = res.body as MessageFullData;
      expect(res.statusCode).toBe(201);
      expect(res.type).toMatch(/json/);
      expect(dbMsgs).toHaveLength(1);
      expect(resBody.id).toBe(dbMsgs[0].id);
      await assertSeenDateUpdated(dbChat as ChatFullData, userOneData.username);
      assertReceivedDateUpdated(updatedDBChat, dbChat, userOneData.username);
    });

    it('should respond with 201, create message without image, and ignore `imagedata` field without an image file', async () => {
      const { authorizedApi } = await prepForAuthorizedTest(userOneData);
      const res = await authorizedApi
        .post(`${CHATS_URL}/${dbChat.id}/messages`)
        .send({ ...msgData, imagedata });
      const dbMsgs = await db.message.findMany({ include: { image: true } });
      const resBody = res.body as MessageFullData;
      expect(res.statusCode).toBe(201);
      expect(res.type).toMatch(/json/);
      expect(dbMsgs).toHaveLength(1);
      expect(resBody.image).toBeNull();
      expect(resBody.imageId).toBeNull();
      expect(resBody.id).toBe(dbMsgs[0].id);
      expect(storage.upload).not.toHaveBeenCalled();
    });

    it('should respond with 201 and create a message with an image', async () => {
      const stream = fs.createReadStream('src/tests/files/good.jpg');
      const preparedImgData = Object.fromEntries(
        Object.entries(imagedata).map(([k, v]) => [`imagedata[${k}]`, v]),
      );
      const { authorizedApi } = await prepForAuthorizedTest(userOneData);
      const res = await authorizedApi
        .post(`${CHATS_URL}/${dbChat.id}/messages`)
        .field(msgData)
        .field(preparedImgData)
        .attach('image', stream);
      const dbMsgs = await db.message.findMany({ include: { image: true } });
      const resBody = res.body as MessageFullData;
      expect(res.statusCode).toBe(201);
      expect(res.type).toMatch(/json/);
      expect(dbMsgs).toHaveLength(1);
      expect(resBody.id).toBe(dbMsgs[0].id);
      expect(resBody.imageId).toBe(dbMsgs[0].imageId);
      assertImageData(Object.assign(res, { body: resBody.image }), { ...imgData, ...imagedata });
      expect(storage.upload).toHaveBeenCalledOnce();
      expect(storage.upload.mock.calls.at(-1)?.at(-1)).toHaveProperty('upsert', false);
    });

    it('should respond with 201 and create an empty message with an image', async () => {
      const stream = fs.createReadStream('src/tests/files/good.jpg');
      const preparedImgData = Object.fromEntries(
        Object.entries(imagedata).map(([k, v]) => [`imagedata[${k}]`, v]),
      );
      const { authorizedApi } = await prepForAuthorizedTest(userOneData);
      const res = await authorizedApi
        .post(`${CHATS_URL}/${dbChat.id}/messages`)
        .field(preparedImgData)
        .attach('image', stream);
      const dbMsgs = await db.message.findMany({ include: { image: true } });
      const resBody = res.body as MessageFullData;
      expect(res.statusCode).toBe(201);
      expect(res.type).toMatch(/json/);
      expect(resBody.body).toBe('');
      expect(dbMsgs).toHaveLength(1);
      expect(resBody.id).toBe(dbMsgs[0].id);
      expect(resBody.body).toBe(dbMsgs[0].body);
      expect(resBody.imageId).toBe(dbMsgs[0].imageId);
      assertImageData(Object.assign(res, { body: resBody.image }), { ...imgData, ...imagedata });
      expect(storage.upload).toHaveBeenCalledOnce();
      expect(storage.upload.mock.calls.at(-1)?.at(-1)).toHaveProperty('upsert', false);
    });
  });

  describe(`POST ${CHATS_URL}`, () => {
    afterEach(async () => {
      await db.chat.deleteMany({});
      await db.image.deleteMany({});
      await db.user.deleteMany({ where: { username: intangibleUserData.username } });
    });

    it('should respond with 401 on unauthorized request', async () => {
      const res = await api.post(CHATS_URL);
      assertUnauthorizedErrorRes(res);
    });

    it('should respond with 400 on request with an empty object', async () => {
      const { authorizedApi } = await prepForAuthorizedTest(userOneData);
      const res = await authorizedApi.post(CHATS_URL).send({});
      assertResponseWithValidationError(res, '', 2);
    });

    it('should respond with 400 on request with invalid profiles data', async () => {
      const message = { body: 'Hello!' };
      const invalidData = [{ profiles: null }, { profiles: ['blah'] }, { profiles: [7] }];
      for (const data of invalidData) {
        const { authorizedApi } = await prepForAuthorizedTest(userOneData);
        const res = await authorizedApi.post(CHATS_URL).send({ ...data, message });
        assertResponseWithValidationError(res, 'profiles', 1);
      }
    });

    it('should respond with 400 on request with an empty message', async () => {
      const testData = { profiles: [crypto.randomUUID()], message: { body: '' } };
      const { authorizedApi } = await prepForAuthorizedTest(userOneData);
      const res = await authorizedApi.post(CHATS_URL).send(testData);
      assertResponseWithValidationError(res, 'body', 1);
    });

    it('should respond with 400 on request with an invalid message', async () => {
      const invalidData = [{ message: 'Hello!' }, { message: true }, { message: 7 }];
      for (const data of invalidData) {
        const { authorizedApi } = await prepForAuthorizedTest(userOneData);
        const res = await authorizedApi
          .post(CHATS_URL)
          .send({ ...data, profiles: [dbUserTwo.profile!.id] });
        assertResponseWithValidationError(res, 'message', 1);
      }
    });

    it('should respond with 400 on request with invalid image type', async () => {
      const stream = fs.createReadStream('src/tests/files/ugly.txt');
      const preparedImgData = Object.fromEntries(
        Object.entries(imagedata).map(([k, v]) => [`imagedata[${k}]`, v]),
      );
      const chatData = { 'profiles[0]': dbUserTwo.profile!.id, 'message[body]': 'Hello!' };
      const { authorizedApi } = await prepForAuthorizedTest(userOneData);
      const res = await authorizedApi
        .post(CHATS_URL)
        .field(chatData)
        .field(preparedImgData)
        .attach('image', stream);
      const resBody = res.body as Types.AppErrorResponse;
      expect(res.type).toMatch(/json/);
      expect(res.statusCode).toBe(400);
      expect(resBody.error.message).toMatch(/invalid image/i);
      expect(storage.upload).not.toHaveBeenCalledOnce();
    });

    it('should respond with 400 on request with too large image file', async () => {
      const stream = fs.createReadStream('src/tests/files/bad.jpg');
      const preparedImgData = Object.fromEntries(
        Object.entries(imagedata).map(([k, v]) => [`imagedata[${k}]`, v]),
      );
      const chatData = { 'profiles[0]': dbUserTwo.profile!.id, 'message[body]': 'Hello!' };
      const { authorizedApi } = await prepForAuthorizedTest(userOneData);
      const res = await authorizedApi
        .post(CHATS_URL)
        .field(chatData)
        .field(preparedImgData)
        .attach('image', stream);
      const resBody = res.body as Types.AppErrorResponse;
      expect(res.type).toMatch(/json/);
      expect(res.statusCode).toBe(400);
      expect(resBody.error.message).toMatch(/too large/i);
      expect(storage.upload).not.toHaveBeenCalledOnce();
    });

    it('should create new chat with a message that have seen by the its sender, ignoring any unknown IDs', async () => {
      const chatData = {
        profiles: [dbUserTwo.profile!.id, crypto.randomUUID()],
        message: { body: 'Hello!' },
      };
      const { authorizedApi } = await prepForAuthorizedTest(userOneData);
      const res = await authorizedApi.post(CHATS_URL).send(chatData);
      const dbMsgs = await db.message.findMany({});
      const dbChats = await db.chat.findMany({});
      const chat = res.body as ChatFullData;
      expect(res.statusCode).toBe(201);
      expect(res.type).toMatch(/json/);
      expect(dbChats).toHaveLength(1);
      expect(dbMsgs).toHaveLength(1);
      assertChat(chat, dbChats[0].id, 1);
      expect(chat.profiles[0].lastSeenAt).toBeTruthy();
      expect(chat.profiles[0].lastReceivedAt).toBeTruthy();
      expect(dbMsgs[0].chatId).toBe(dbChats[0].id);
      expect(chat.messages).toBeInstanceOf(Array);
      expect(chat.messages[0].id).toBe(dbMsgs[0].id);
    });

    it('should create a self-chat if the given profiles array is empty or has an unknown profile id', async () => {
      const { authorizedApi } = await prepForAuthorizedTest(userOneData);
      const profilesData = [[], [crypto.randomUUID()]];
      for (const profiles of profilesData) {
        const data = { profiles, message: { body: 'Hello!' } };
        const res = await authorizedApi.post(CHATS_URL).send(data);
        const dbChats = await db.chat.findMany({ include: { profiles: true } });
        const dbMsgs = await db.message.findMany({});
        await db.chat.deleteMany({});
        await db.message.deleteMany({});
        const chat = res.body as ChatFullData;
        expect(res.statusCode).toBe(201);
        expect(res.type).toMatch(/json/);
        expect(dbChats).toHaveLength(1);
        expect(dbMsgs).toHaveLength(1);
        assertChat(chat, dbChats[0].id, 1, 1);
        expect(chat.profiles[0].lastSeenAt).toBeTruthy();
        expect(chat.profiles[0].lastReceivedAt).toBeTruthy();
        expect(dbMsgs[0].chatId).toBe(dbChats[0].id);
        expect(chat.profiles[0].profileName).toBe(dbUserOne.username);
        expect(chat.messages).toBeInstanceOf(Array);
        expect(chat.messages[0].id).toBe(dbMsgs[0].id);
        expect(chat.messages[0].body).toBe(data.message.body);
      }
    });

    it('should use an already exist chat, and eliminate any last-seen-date intangible profiles', async () => {
      const intangibleUser = await createUser(intangibleUserData);
      const chatMembers = [dbUserOne, intangibleUser, dbUserTwo];
      const oldChat = await createChat('', chatMembers);
      await createMessage(oldChat.id, dbUserOne);
      const chatData = {
        profiles: chatMembers.map((u) => u.profile!.id),
        message: { body: 'Whats up?' },
      };
      const { authorizedApi } = await prepForAuthorizedTest(userOneData);
      const res = await authorizedApi.post(CHATS_URL).send(chatData);
      const dbMsgs = await db.message.findMany({ orderBy: { createdAt: 'desc' } });
      const dbChats = await db.chat.findMany({});
      const chat = res.body as ChatFullData;
      expect(res.statusCode).toBe(201);
      expect(res.type).toMatch(/json/);
      expect(dbChats).toHaveLength(1);
      expect(dbMsgs).toHaveLength(2);
      assertChat(chat, dbChats[0].id, 2, 3);
      assertChatMembersTangibility(chat);
      expect(dbMsgs[0].chatId).toBe(dbChats[0].id);
      expect(chat.messages).toBeInstanceOf(Array);
      expect(chat.messages).toHaveLength(2);
    });

    it('should use an already exist chat, and include the last-seen-date for the current, intangible profile only', async () => {
      const intangibleUser = await createUser(intangibleUserData);
      const chatMembers = [intangibleUser, dbUserOne, dbUserTwo];
      const oldChat = await createChat('', chatMembers);
      await createMessage(oldChat.id, dbUserOne);
      const chatData = {
        profiles: chatMembers.map((u) => u.profile!.id),
        message: { body: 'Whats up?' },
      };
      const { authorizedApi } = await prepForAuthorizedTest(intangibleUserData);
      const res = await authorizedApi.post(CHATS_URL).send(chatData);
      const dbMsgs = await db.message.findMany({ orderBy: { createdAt: 'desc' } });
      const dbChats = await db.chat.findMany({});
      const chat = res.body as ChatFullData;
      expect(res.statusCode).toBe(201);
      expect(res.type).toMatch(/json/);
      expect(dbChats).toHaveLength(1);
      expect(dbMsgs).toHaveLength(2);
      assertChat(chat, dbChats[0].id, 2, 3);
      for (const member of chat.profiles) {
        expect(member.lastReceivedAt).toBeTruthy();
        if (member.profileName === intangibleUser.username) {
          expect(member.lastSeenAt).toBeTruthy();
        } else {
          expect(member.lastSeenAt).toBeNull();
        }
      }
      expect(dbMsgs[0].chatId).toBe(dbChats[0].id);
      expect(chat.messages).toBeInstanceOf(Array);
      expect(chat.messages).toHaveLength(2);
    });

    it('should use an already exist chat that has a message and delete the any other duplications', async () => {
      for (let i = 0; i < 3; i++) await createChat(i % 2 > 0 ? 'Hi!' : '');
      const chatData = { profiles: [dbUserTwo.profile!.id], message: { body: 'Hello!' } };
      const { authorizedApi } = await prepForAuthorizedTest(userOneData);
      const res = await authorizedApi.post(CHATS_URL).send(chatData);
      const dbMsgs = await db.message.findMany({});
      const dbChats = await db.chat.findMany({});
      const chat = res.body as ChatFullData;
      expect(res.statusCode).toBe(201);
      expect(res.type).toMatch(/json/);
      expect(dbChats).toHaveLength(1);
      expect(dbMsgs).toHaveLength(2);
      assertChat(chat, dbChats[0].id, 2);
      expect(dbMsgs[0].chatId).toBe(dbChats[0].id);
    });

    it('should create new chat with a non-image message, and ignore `imagedata` field without an image file', async () => {
      const profileId = dbUserTwo.profile!.id;
      const chatData = { profiles: [profileId], message: { body: 'Hello!' }, imagedata };
      const { authorizedApi } = await prepForAuthorizedTest(userOneData);
      const res = await authorizedApi.post(CHATS_URL).send(chatData);
      const dbMsgs = await db.message.findMany({});
      const dbChats = await db.chat.findMany({});
      const chat = res.body as ChatFullData;
      expect(res.statusCode).toBe(201);
      expect(res.type).toMatch(/json/);
      expect(dbChats).toHaveLength(1);
      expect(dbMsgs).toHaveLength(1);
      assertChat(chat, dbChats[0].id, 1);
      expect(chat.profiles[0].lastSeenAt).toBeTruthy();
      expect(chat.profiles[0].lastReceivedAt).toBeTruthy();
      expect(dbMsgs[0].chatId).toBe(dbChats[0].id);
      expect(chat.messages).toBeInstanceOf(Array);
      assertMessage(chat.messages[0], dbMsgs[0].id);
    });

    it('should create new chat with an image a non-empty message', async () => {
      const stream = fs.createReadStream('src/tests/files/good.jpg');
      const preparedImgData = Object.fromEntries(
        Object.entries(imagedata).map(([k, v]) => [`imagedata[${k}]`, v]),
      );
      const chatData = { 'profiles[0]': dbUserTwo.profile!.id, 'message[body]': 'Hello!' };
      const { authorizedApi } = await prepForAuthorizedTest(userOneData);
      const res = await authorizedApi
        .post(CHATS_URL)
        .field(chatData)
        .field(preparedImgData)
        .attach('image', stream);
      const dbMsgs = await db.message.findMany({ include: { image: true } });
      const dbChats = await db.chat.findMany({});
      const chat = res.body as ChatFullData;
      expect(res.statusCode).toBe(201);
      expect(res.type).toMatch(/json/);
      expect(dbChats).toHaveLength(1);
      expect(dbMsgs).toHaveLength(1);
      assertChat(chat, dbChats[0].id, 1);
      expect(chat.profiles[0].lastSeenAt).toBeTruthy();
      expect(chat.profiles[0].lastReceivedAt).toBeTruthy();
      expect(dbMsgs[0].chatId).toBe(dbChats[0].id);
      expect(chat.messages).toBeInstanceOf(Array);
      expect(chat.messages[0].image).toBeTruthy();
      assertMessage(chat.messages[0], dbMsgs[0].id);
      expect(chat.messages[0].imageId).toBe(dbMsgs[0].imageId);
      expect(storage.upload).toHaveBeenCalledOnce();
      expect(storage.upload.mock.calls.at(-1)?.at(-1)).toHaveProperty('upsert', false);
    });

    it('should create new chat with an image and an empty message', async () => {
      const stream = fs.createReadStream('src/tests/files/good.jpg');
      const preparedImgData = Object.fromEntries(
        Object.entries(imagedata).map(([k, v]) => [`imagedata[${k}]`, v]),
      );
      const chatData = { 'profiles[0]': dbUserTwo.profile!.id };
      const { authorizedApi } = await prepForAuthorizedTest(userOneData);
      const res = await authorizedApi
        .post(CHATS_URL)
        .field(chatData)
        .field(preparedImgData)
        .attach('image', stream);
      const dbMsgs = await db.message.findMany({ include: { image: true } });
      const dbChats = await db.chat.findMany({});
      const chat = res.body as ChatFullData;
      expect(res.statusCode).toBe(201);
      expect(res.type).toMatch(/json/);
      expect(dbChats).toHaveLength(1);
      expect(dbMsgs).toHaveLength(1);
      assertChat(chat, dbChats[0].id, 1);
      expect(chat.profiles[0].lastSeenAt).toBeTruthy();
      expect(chat.profiles[0].lastReceivedAt).toBeTruthy();
      expect(dbMsgs[0].chatId).toBe(dbChats[0].id);
      expect(chat.messages).toBeInstanceOf(Array);
      expect(chat.messages[0].image).toBeTruthy();
      expect(chat.messages[0].body).toBe('');
      assertMessage(chat.messages[0], dbMsgs[0].id);
      expect(chat.messages[0].imageId).toBe(dbMsgs[0].imageId);
      expect(storage.upload).toHaveBeenCalledOnce();
      expect(storage.upload.mock.calls.at(-1)?.at(-1)).toHaveProperty('upsert', false);
    });

    it('should create multiple chats sequentially, each of which have seen/received by the its owner', async () => {
      const profileIds = [dbUserTwo.profile!.id, dbXUser.profile!.id, dbAdmin.profile!.id];
      for (let i = 0; i < profileIds.length; i++) {
        const iterNum = i + 1;
        const chatData = { profiles: [profileIds[i]], message: { body: 'Hello!' } };
        const { authorizedApi } = await prepForAuthorizedTest(userOneData);
        const res = await authorizedApi.post(CHATS_URL).send(chatData);
        const dbMsgs = await db.message.findMany({});
        const dbChats = await db.chat.findMany({});
        const chat = res.body as ChatFullData;
        expect(res.statusCode).toBe(201);
        expect(res.type).toMatch(/json/);
        expect(dbChats).toHaveLength(iterNum);
        expect(dbMsgs).toHaveLength(iterNum);
        assertChat(chat, dbChats[i].id, 1);
        expect(chat.profiles[0].lastSeenAt).toBeTruthy();
        expect(chat.profiles[0].lastReceivedAt).toBeTruthy();
        expect(dbMsgs[i].chatId).toBe(dbChats[i].id);
        expect(chat.messages).toBeInstanceOf(Array);
        assertMessage(chat.messages[0], dbMsgs[i].id);
      }
    });
  });

  describe(`PATCH ${CHATS_URL}/:id/seen`, () => {
    let dbChat: Awaited<ReturnType<typeof createChat>>;

    const assertProfileChatDatesUnmodified = async () => {
      const dbChatNow = (await db.chat.findUnique({
        where: { id: dbChat.id },
        include: { profiles: true },
      }))!;
      expect(dbChatNow.profiles.map((p) => [p.lastSeenAt, p.lastReceivedAt])).toStrictEqual(
        dbChat.profiles.map((p) => [p.lastSeenAt, p.lastReceivedAt]),
      );
    };

    const assertProfileChatSeenDateUpdated = async (
      updatedProfileId: Types.PublicProfile['id'],
      updatedDate: string,
    ) => {
      const dbChatNow = (await db.chat.findUnique({
        where: { id: dbChat.id },
        include: { profiles: true },
      }))!;
      const chatProfile = dbChat.profiles.find((p) => p.profileId === updatedProfileId)!;
      const chatProfileNow = dbChatNow.profiles.find((p) => p.profileId === updatedProfileId)!;
      expect(chatProfileNow.lastReceivedAt!.getTime()).toBe(chatProfile.lastReceivedAt!.getTime());
      expect(chatProfileNow.lastSeenAt!.getTime()).toBeGreaterThan(
        chatProfile.lastSeenAt!.getTime(),
      );
      expect(chatProfileNow.lastSeenAt!.toISOString()).toBe(updatedDate);
    };

    beforeAll(async () => {
      await db.chat.deleteMany({});
      dbChat = await createChat('', [dbUserOne, dbUserTwo]);
    });

    afterAll(async () => {
      await db.chat.deleteMany({});
    });

    it('should respond with 401 on unauthorized request', async () => {
      const res = await api.patch(`${CHATS_URL}/${dbChat.id}/seen`);
      assertUnauthorizedErrorRes(res);
      await assertProfileChatDatesUnmodified();
    });

    it('should respond with 404 on non-existent chat id', async () => {
      const { authorizedApi } = await prepForAuthorizedTest(userOneData);
      const res = await authorizedApi.patch(`${CHATS_URL}/${crypto.randomUUID()}/seen`);
      assertNotFoundErrorRes(res);
      await assertProfileChatDatesUnmodified();
    });

    it('should respond with 404 on request from none chat member', async () => {
      const { authorizedApi } = await prepForAuthorizedTest(xUserData);
      const res = await authorizedApi.patch(`${CHATS_URL}/${crypto.randomUUID()}/seen`);
      assertNotFoundErrorRes(res);
      await assertProfileChatDatesUnmodified();
    });

    it('should set last seen date', async () => {
      for (const [ud, dbu] of [
        [userOneData, dbUserOne],
        [userTwoData, dbUserTwo],
      ] as const) {
        const { authorizedApi } = await prepForAuthorizedTest(ud);
        const res = await authorizedApi.patch(`${CHATS_URL}/${dbChat.id}/seen`);
        expect(res.statusCode).toBe(200);
        expect(res.type).toMatch(/json/);
        await assertProfileChatSeenDateUpdated(dbu.profile!.id, res.body as string);
      }
    });

    it('should update last seen date', async () => {
      await db.profilesChats.updateMany({
        where: { chatId: dbChat.id },
        data: { lastSeenAt: new Date() },
      });
      for (const [ud, dbu] of [
        [userOneData, dbUserOne],
        [userTwoData, dbUserTwo],
      ] as const) {
        const { authorizedApi } = await prepForAuthorizedTest(ud);
        const res = await authorizedApi.patch(`${CHATS_URL}/${dbChat.id}/seen`);
        expect(res.statusCode).toBe(200);
        expect(res.type).toMatch(/json/);
        await assertProfileChatSeenDateUpdated(dbu.profile!.id, res.body as string);
      }
    });
  });

  describe(`DELETE ${CHATS_URL}/:id`, () => {
    afterEach(async () => {
      await db.chat.deleteMany({});
    });

    it('should respond with 401 on unauthorized request', async () => {
      const chatId = (await createChat()).id;
      const res = await api.delete(`${CHATS_URL}/${chatId}`);
      await api.delete(`${CHATS_URL}/${chatId}`);
      const dbMsgs = await db.message.findMany({});
      const dbChats = await db.chat.findMany({});
      assertUnauthorizedErrorRes(res);
      expect(dbMsgs).toHaveLength(1);
      expect(dbChats).toHaveLength(1);
      expect(dbMsgs[0].chatId).toBe(dbChats[0].id);
    });

    it('should respond with 204, and do nothing, on request with a non-existent chat id', async () => {
      await createChat();
      const chatId = crypto.randomUUID();
      const { authorizedApi } = await prepForAuthorizedTest(userOneData);
      const res = await authorizedApi.delete(`${CHATS_URL}/${chatId}`);
      await authorizedApi.delete(`${CHATS_URL}/${chatId}`);
      const dbMsgs = await db.message.findMany({});
      const dbChats = await db.chat.findMany({});
      expect(res.body).toStrictEqual({});
      expect(res.statusCode).toBe(204);
      expect(dbMsgs).toHaveLength(1);
      expect(dbChats).toHaveLength(1);
      expect(dbMsgs[0].chatId).toBe(dbChats[0].id);
    });

    it('should respond with 204 and delete the profile from chat, delete an empty chat, and be idempotent', async () => {
      await createChat();
      const usersData = [userOneData, userTwoData];
      const users = [dbUserOne, dbUserTwo];
      const chat = await createChat('Hi!', users);
      for (let i = 0; i < users.length; i++) {
        const { authorizedApi } = await prepForAuthorizedTest(usersData[i]);
        const res = await authorizedApi.delete(`${CHATS_URL}/${chat.id}`);
        await authorizedApi.delete(`${CHATS_URL}/${chat.id}`);
        const dbMsgs = await db.message.findMany({});
        const dbChats = await db.chat.findMany({});
        expect(res.body).toStrictEqual({});
        expect(res.statusCode).toBe(204);
        if (i === users.length - 1) {
          expect(dbMsgs).toHaveLength(1);
          expect(dbChats).toHaveLength(1);
        } else {
          expect(dbMsgs).toHaveLength(2);
          expect(dbChats).toHaveLength(2);
        }
      }
      expect(await db.message.findMany({})).toHaveLength(1);
      expect(await db.chat.findMany({})).toHaveLength(1);
    });
  });
});
