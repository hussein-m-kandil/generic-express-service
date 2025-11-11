/* eslint-disable security/detect-object-injection */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Prisma, Chat, Message } from '@/../prisma/client';
import { CHATS_URL, SIGNIN_URL } from './utils';
import { faker } from '@faker-js/faker';
import setup from '@/tests/api/setup';
import db from '@/lib/db';

interface MessageIncludeFields {
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

type MessageFullData = Prisma.MessageGetPayload<{ include: MessageIncludeFields }>;

const PAGE_LEN = 10;
const EXTRA_LEN = 3;
const ITEMS_LEN = PAGE_LEN + EXTRA_LEN;

const assertMessage = (msg: MessageFullData, expectedMsgId: Message['id']) => {
  expect(msg.profile!.user.username).toBeTruthy();
  expect(msg.profileName).toBeTruthy();
  expect(msg.id).toBe(expectedMsgId);
  expect(msg.image).toBeTruthy();
  expect(msg.image).not.toHaveProperty('owner');
};

const assertChat = (chat: ChatFullData, expectedChatId: Chat['id']) => {
  expect(chat.id).toBe(expectedChatId);
  expect(chat.managers).toBeInstanceOf(Array);
  expect(chat.managers).toHaveLength(1);
  expect(chat.profiles).toBeInstanceOf(Array);
  expect(chat.profiles).toHaveLength(2);
  expect(chat.messages).toBeInstanceOf(Array);
  expect(chat.messages).toHaveLength(PAGE_LEN);
  for (const manager of chat.managers) {
    expect(manager.profile.user.password).toBeUndefined();
    expect(manager.profile.user.username).toBeTruthy();
  }
  for (const member of chat.profiles) {
    expect(member.profile.user.password).toBeUndefined();
    expect(member.profile.user.username).toBeTruthy();
  }
  for (const msg of chat.messages) assertMessage(msg, msg.id);
};

describe('Chats endpoints', async () => {
  const {
    userOneData,
    userTwoData,
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
    prepForAuthorizedTest,
    assertNotFoundErrorRes,
    assertInvalidIdErrorRes,
    assertUnauthorizedErrorRes,
    assertResponseWithValidationError,
  } = await setup(SIGNIN_URL);

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
    return createUser({ username, fullname, password });
  };

  const createChat = async (msg = 'Hi!', users = [dbUserOne, dbUserTwo], withImage = true) => {
    const profileName = users[0].username;
    const profileId = users[0].profile!.id;
    const imageId = msg && withImage ? (await createImage(imgData)).id : undefined;
    return await db.chat.create({
      data: {
        profiles: { createMany: { data: users.map((u) => ({ profileId: u.profile!.id })) } },
        managers: { create: { profileId: users[0].profile!.id, role: 'OWNER' } },
        ...(msg ? { messages: { create: { body: msg, profileId, profileName, imageId } } } : {}),
      },
      include: { profiles: true, managers: true, messages: true },
    });
  };

  const createMessage = async (chatId: Chat['id'], dbUser: typeof dbUserOne, withImage = true) => {
    return db.message.create({
      data: {
        imageId: withImage ? (await createImage(imgData)).id : undefined,
        profileId: dbUser.profile!.id,
        profileName: dbUser.username,
        body: faker.lorem.sentence(),
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

  describe(`GET ${CHATS_URL}`, () => {
    // Isolate this test because it needs a clean Chat database
    it(`should respond with 200 and an empty list`, async () => {
      const { authorizedApi } = await prepForAuthorizedTest(userOneData);
      const res = await authorizedApi.get(CHATS_URL);
      expect(res.statusCode).toBe(200);
      expect(res.type).toMatch(/json/);
      expect(res.body).toStrictEqual([]);
    });
  });

  describe('GET', () => {
    const dbChats: Awaited<ReturnType<typeof createChat>>[] = [];
    const dbMsgs: Message[] = [];

    beforeAll(async () => {
      await db.chat.deleteMany({});
      for (const dbUser of dbUsers) {
        const chat = await createChat('Hi!', [dbUserOne, dbUser]);
        dbMsgs.push(chat.messages[0]);
        const msgsCount = ITEMS_LEN - 1; // Skip the initial, owner message (see prev 2 lines ^)
        for (let j = 0; j < msgsCount; j++) dbMsgs.push(await createMessage(chat.id, dbUsers[j]));
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
          resBody.forEach((c) => assertChat(c, c.id));
        }
        expect(firstChat!.id).toBe(dbChats.at(-1)!.id);
      });

      it('should respond custom-asc-paginated chats with their profiles, managers, and 1st messages page', async () => {
        let firstChat: ChatFullData | undefined;
        let cursor: Chat['id'] | undefined;
        const limit = 2;
        const pages: { len: number }[] = Array.from({ length: Math.ceil(ITEMS_LEN / limit) }).map(
          (_, i, arr) => ({ len: i < arr.length - 1 ? limit : ITEMS_LEN - i * limit })
        );
        for (const page of pages) {
          const { authorizedApi } = await prepForAuthorizedTest(userOneData);
          const res = await authorizedApi.get(
            `${CHATS_URL}?sort=asc&limit=${limit}${cursor ? '&cursor=' + cursor : ''}`
          );
          const resBody = res.body as ChatFullData[];
          cursor = resBody.at(-1)!.id;
          firstChat ??= resBody[0];
          expect(res.statusCode).toBe(200);
          expect(res.type).toMatch(/json/);
          expect(resBody).toBeInstanceOf(Array);
          expect(resBody).toHaveLength(page.len);
          resBody.forEach((c) => assertChat(c, c.id));
        }
        expect(firstChat!.id).toBe(dbChats[0].id);
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
        const chat = dbChats[0];
        const { authorizedApi } = await prepForAuthorizedTest(userOneData);
        const res = await authorizedApi.get(`${CHATS_URL}/${chat.id}`);
        const resBody = res.body as ChatFullData;
        expect(res.statusCode).toBe(200);
        expect(res.type).toMatch(/json/);
        assertChat(resBody, chat.id);
      });
    });

    describe(`${CHATS_URL}/:id/messages`, () => {
      it('should respond with 401 on unauthorized request', async () => {
        const res = await api.get(`${CHATS_URL}/${dbChats[0].id}/messages`);
        assertUnauthorizedErrorRes(res);
      });

      it('should respond with 200 and an empty array on unknown chat id', async () => {
        const { authorizedApi } = await prepForAuthorizedTest(userOneData);
        const res = await authorizedApi.get(`${CHATS_URL}/${crypto.randomUUID()}/messages`);
        expect(res.statusCode).toBe(200);
        expect(res.type).toMatch(/json/);
        expect(res.body).toStrictEqual([]);
      });

      it('should respond with 200 and an empty array if the current user not a chat member', async () => {
        const chat = dbChats[0];
        const password = faker.internet.password();
        const { id, username } = await createFakeUser(usedUsernames, { password });
        const { authorizedApi } = await prepForAuthorizedTest({ username, password });
        const res = await authorizedApi.get(`${CHATS_URL}/${chat.id}/messages`);
        expect(res.statusCode).toBe(200);
        expect(res.type).toMatch(/json/);
        expect(res.body).toStrictEqual([]);
        await db.user.delete({ where: { id } });
      });

      it('should respond with 200 and a desc-paginated messages with their profiles, and images', async () => {
        const pages = [{ len: PAGE_LEN }, { len: EXTRA_LEN }];
        let firstMessage: MessageFullData | undefined;
        let cursor: Message['id'] | undefined;
        const chat = dbChats[0];
        for (const page of pages) {
          const { authorizedApi } = await prepForAuthorizedTest(userOneData);
          const res = await authorizedApi.get(
            `${CHATS_URL}/${chat.id}/messages${cursor ? '?cursor=' + cursor : ''}`
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
      });

      it('should respond with 200 and a custom-asc-paginated messages with their profiles, and images', async () => {
        let firstMessage: MessageFullData | undefined;
        let cursor: Message['id'] | undefined;
        const chat = dbChats[0];
        const limit = 2;
        const pages: { len: number }[] = Array.from({ length: Math.ceil(ITEMS_LEN / limit) }).map(
          (_, i, arr) => ({ len: i < arr.length - 1 ? limit : ITEMS_LEN - i * limit })
        );
        for (const page of pages) {
          const { authorizedApi } = await prepForAuthorizedTest(userOneData);
          const res = await authorizedApi.get(
            `${CHATS_URL}/${chat.id}/messages?sort=asc&limit=${limit}${
              cursor ? '&cursor=' + cursor : ''
            }`
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
      });
    });
  });

  describe(`POST ${CHATS_URL}`, () => {
    afterEach(async () => {
      await db.chat.deleteMany({});
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
      const invalidData = [{ profiles: null }, { profiles: [] }, { profiles: [7] }];
      for (const data of invalidData) {
        const { authorizedApi } = await prepForAuthorizedTest(userOneData);
        const res = await authorizedApi.post(CHATS_URL).send({ ...data, message: 'Hello!' });
        assertResponseWithValidationError(res, 'profiles', 1);
      }
    });

    it('should respond with 400 on request with an invalid message', async () => {
      const invalidData = [{ message: '' }, { message: true }, { message: 7 }];
      for (const data of invalidData) {
        const { authorizedApi } = await prepForAuthorizedTest(userOneData);
        const res = await authorizedApi
          .post(CHATS_URL)
          .send({ ...data, profiles: [dbUserTwo.profile!.id] });
        assertResponseWithValidationError(res, 'message', 1);
      }
    });

    it('should respond with 400 on unknown (invalid) profile id', async () => {
      const profileId = crypto.randomUUID();
      const data = { profiles: [profileId], message: 'Hello!' };
      const { authorizedApi } = await prepForAuthorizedTest(userOneData);
      const res = await authorizedApi.post(CHATS_URL).send(data);
      const dbChats = await db.chat.findMany({});
      assertInvalidIdErrorRes(res);
      expect(dbChats).toHaveLength(0);
    });

    it('should create new chat', async () => {
      const profileId = dbUserTwo.profile!.id;
      const data = { profiles: [profileId], message: 'Hello!' };
      const { authorizedApi } = await prepForAuthorizedTest(userOneData);
      const res = await authorizedApi.post(CHATS_URL).send(data);
      const dbMsgs = await db.message.findMany({});
      const dbChats = await db.chat.findMany({});
      const chat = res.body as Chat;
      expect(res.statusCode).toBe(201);
      expect(res.type).toMatch(/json/);
      expect(dbChats).toHaveLength(1);
      expect(dbMsgs).toHaveLength(1);
      expect(chat.id).toBe(dbChats[0].id);
      expect(dbMsgs[0].chatId).toBe(dbChats[0].id);
    });

    it('should use an already exist chat', async () => {
      const profileId = dbUserTwo.profile!.id;
      const data = { profiles: [profileId], message: 'Hello!' };
      const { authorizedApi } = await prepForAuthorizedTest(userOneData);
      await authorizedApi.post(CHATS_URL).send(data);
      const res = await authorizedApi.post(CHATS_URL).send(data);
      const dbMsgs = await db.message.findMany({});
      const dbChats = await db.chat.findMany({});
      const chat = res.body as Chat;
      expect(res.statusCode).toBe(201);
      expect(res.type).toMatch(/json/);
      expect(dbChats).toHaveLength(1);
      expect(dbMsgs).toHaveLength(2);
      expect(chat.id).toBe(dbChats[0].id);
      expect(dbMsgs[0].chatId).toBe(dbChats[0].id);
    });

    it('should use an already exist chat that has a message and delete the any other duplications', async () => {
      for (let i = 0; i < 3; i++) await createChat(i % 2 > 0 ? 'Hi!' : '');
      const data = { profiles: [dbUserTwo.profile!.id], message: 'Hello!' };
      const { authorizedApi } = await prepForAuthorizedTest(userOneData);
      const res = await authorizedApi.post(CHATS_URL).send(data);
      const dbMsgs = await db.message.findMany({});
      const dbChats = await db.chat.findMany({});
      const chat = res.body as Chat;
      expect(res.statusCode).toBe(201);
      expect(res.type).toMatch(/json/);
      expect(dbChats).toHaveLength(1);
      expect(dbMsgs).toHaveLength(2);
      expect(chat.id).toBe(dbChats[0].id);
      expect(dbMsgs[0].chatId).toBe(dbChats[0].id);
    });

    it('should create multiple chats sequentially', async () => {
      const profileIds = [dbUserTwo.profile!.id, dbXUser.profile!.id, dbAdmin.profile!.id];
      for (let i = 0; i < profileIds.length; i++) {
        const iterNum = i + 1;
        const data = { profiles: [profileIds[i]], message: 'Hello!' };
        const { authorizedApi } = await prepForAuthorizedTest(userOneData);
        const res = await authorizedApi.post(CHATS_URL).send(data);
        const dbMsgs = await db.message.findMany({});
        const dbChats = await db.chat.findMany({});
        const chat = res.body as Chat;
        expect(res.statusCode).toBe(201);
        expect(res.type).toMatch(/json/);
        expect(dbChats).toHaveLength(iterNum);
        expect(dbMsgs).toHaveLength(iterNum);
        expect(chat.id).toBe(dbChats[i].id);
        expect(dbMsgs[i].chatId).toBe(dbChats[i].id);
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
