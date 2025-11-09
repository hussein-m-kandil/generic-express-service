/* eslint-disable security/detect-object-injection */
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { CHATS_URL, SIGNIN_URL } from './utils';
import { Chat } from '@/../prisma/client';
import setup from '@/tests/api/setup';
import db from '@/lib/db';

describe('Chats endpoints', async () => {
  const {
    api,
    dbAdmin,
    dbXUser,
    dbUserOne,
    dbUserTwo,
    userOneData,
    deleteAllUsers,
    deleteAllImages,
    prepForAuthorizedTest,
    assertInvalidIdErrorRes,
    assertUnauthorizedErrorRes,
    assertResponseWithValidationError,
  } = await setup(SIGNIN_URL);

  afterEach(async () => {
    await db.chat.deleteMany({});
  });

  afterAll(async () => {
    await deleteAllUsers();
    await deleteAllImages();
  });

  const createChat = async (msg = 'Hi!', users = [dbUserOne, dbUserTwo]) => {
    const profileName = users[0].username;
    const profileId = users[0].profile!.id;
    return await db.chat.create({
      data: {
        profiles: { createMany: { data: users.map((u) => ({ profileId: u.profile!.id })) } },
        managers: { create: { profileId: users[0].profile!.id, role: 'OWNER' } },
        ...(msg ? { messages: { create: { body: msg, profileId, profileName } } } : {}),
      },
      include: { profiles: true, managers: true, messages: true },
    });
  };

  describe(`POST ${CHATS_URL}`, () => {
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
});
