/* eslint-disable security/detect-object-injection */
import * as Types from '@/types';
import * as TestUtils from './utils';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { CharacterRect, CharacterFinder } from '@/../prisma/client';
import { PASSIVE_PERIOD_MS } from '@/api/v1/characters';
import { CHARACTERS_URL } from './utils';
import { faker } from '@faker-js/faker';
import supertest from 'supertest';
import app from '@/app';
import db from '@/lib/db';

const createValidPoint = (characterRect: CharacterRect) => {
  return {
    x: faker.number.int({ min: characterRect.left + 1, max: characterRect.right - 1 }),
    y: faker.number.int({ min: characterRect.top + 1, max: characterRect.bottom - 1 }),
  };
};

const createInvalidPoint = (characterRect: CharacterRect) => {
  const { top, left, right, bottom } = characterRect;
  const { x, y } = createValidPoint(characterRect);
  return faker.helpers.arrayElement([
    { x: right + 1, y: bottom + 1 },
    { x: left - 1, y: top - 1 },
    { x, y: bottom + 1 },
    { x: right + 1, y },
    { x: left - 1, y },
    { x, y: top - 1 },
  ]);
};

const CHARACTERS_EVAL = `${CHARACTERS_URL}/eval`;
const CHARACTERS_FINDER = `${CHARACTERS_URL}/finders`;

const api = supertest(app);

const rectMin = 9;
const rectMax = 999;

const characters = Array.from({ length: faker.number.int({ min: 3, max: 5 }) }).map(() => {
  const top = faker.number.int({ min: rectMin, max: rectMax * 0.5 });
  const left = faker.number.int({ min: rectMin, max: rectMax * 0.5 });
  const right = faker.number.int({ min: rectMin + left, max: rectMax });
  const bottom = faker.number.int({ min: rectMin + top, max: rectMax });
  const name = faker.person.firstName().toLowerCase();
  return { name, left, top, right, bottom };
});

const selectionProps = ['characterName', 'selectedPoint'];

const assertCharacterFinder = (res: supertest.Response, name = 'Anonymous') => {
  const resBody = res.body as CharacterFinder;
  expect(res.type).toMatch(/json/);
  expect(res.statusCode).toBe(200);
  expect(resBody).toBeTypeOf('object');
  expect(resBody.createdAt).toBeTruthy();
  expect(resBody.updatedAt).toBeTruthy();
  expect(resBody.duration).toBeNull();
  expect(resBody.name).toBe(name);
  expect(resBody.id).toBeTruthy();
  expect(resBody.id).toBeTypeOf('string');
  expect(resBody.createdAt).toBeTypeOf('string');
  expect(resBody.updatedAt).toBeTypeOf('string');
};

describe('Characters endpoints', () => {
  let finder: CharacterFinder;
  const name = 'Sherlock Holmes';

  beforeEach(async () => {
    finder = await db.characterFinder.create({ data: { name } });
  });

  beforeAll(async () => {
    await db.characterRect.createMany({ data: characters });
  });

  afterAll(async () => {
    await db.characterRect.deleteMany({});
  });

  afterEach(async () => {
    await db.characterFinder.deleteMany({});
  });

  describe(`GET ${CHARACTERS_FINDER}`, () => {
    it('should get only the winners in an ascending order', async () => {
      const data = [
        { name: 'Finder 1', duration: 2 },
        { name: 'Finder 2' },
        { name: 'Finder 3', duration: 1 },
      ];
      const finders = await db.characterFinder.createManyAndReturn({ data });
      const expectFinders = finders
        .filter((f) => f.duration !== null)
        .sort((a, b) => a.duration! - b.duration!);
      for (const query of ['', '?filter=winner']) {
        const res = await api.get(`${CHARACTERS_FINDER}${query}`);
        expect(res.type).toMatch(/json/);
        expect(res.statusCode).toBe(200);
        expect(res.body).toStrictEqual(JSON.parse(JSON.stringify(expectFinders)));
      }
    });

    it('should get all finders in a specific order', async () => {
      const data = [
        { name: 'Finder 1', duration: 2 },
        { name: 'Finder 2' },
        { name: 'Finder 3', duration: 1 },
      ];
      const finders = await db.characterFinder.createManyAndReturn({ data });
      const expectFinders = [
        ...finders.filter((f) => f.duration !== null).sort((a, b) => a.duration! - b.duration!),
        finders[1],
        finder,
      ];
      const res = await api.get(`${CHARACTERS_FINDER}?filter=all`);
      expect(res.type).toMatch(/json/);
      expect(res.statusCode).toBe(200);
      expect(res.body).toStrictEqual(JSON.parse(JSON.stringify(expectFinders)));
    });

    it('should purge passive finders before respond', async () => {
      const date1 = new Date(Date.now() - PASSIVE_PERIOD_MS + 1000);
      const date2 = new Date(Date.now() - PASSIVE_PERIOD_MS);
      const data = [
        { name: 'Finder 1', createdAt: date1, updatedAt: date1 },
        { name: 'Finder 2', createdAt: date2, updatedAt: date2 },
      ];
      const finders = await db.characterFinder.createManyAndReturn({ data });
      const expectFinders = [finder, finders[0]];
      const res = await api.get(`${CHARACTERS_FINDER}?filter=all`);
      const deletedFinder = await db.characterFinder.findUnique({ where: { id: finders[1].id } });
      expect(deletedFinder).toBeNull();
      expect(res.type).toMatch(/json/);
      expect(res.statusCode).toBe(200);
      expect(res.body).toStrictEqual(JSON.parse(JSON.stringify(expectFinders)));
    });
  });

  describe(`GET ${CHARACTERS_FINDER}/:id`, () => {
    it('should respond with 400 on an invalid id', async () => {
      const invalidId = 'blah123';
      const res = await api.get(`${CHARACTERS_FINDER}/${invalidId}`);
      const dbFinder = await db.characterFinder.findUnique({ where: { id: finder.id } });
      TestUtils.assertInvalidIdErrorRes(res);
      expect(dbFinder).toStrictEqual(finder);
    });

    it('should respond with 404 on a non-existent id', async () => {
      const randId = crypto.randomUUID();
      const res = await api.get(`${CHARACTERS_FINDER}/${randId}`);
      const dbFinder = await db.characterFinder.findUnique({ where: { id: finder.id } });
      TestUtils.assertNotFoundErrorRes(res);
      expect(dbFinder).toStrictEqual(finder);
    });

    it('should respond with 404 on an id a deleted finder', async () => {
      await db.characterFinder.delete({ where: { id: finder.id } });
      const res = await api.get(`${CHARACTERS_FINDER}/${finder.id}`);
      TestUtils.assertNotFoundErrorRes(res);
    });

    it('should respond with 404 on an id for a finder that deleted due to passiveness', async () => {
      const date = new Date(Date.now() - PASSIVE_PERIOD_MS);
      const data = { name: 'Finder 2', createdAt: date, updatedAt: date };
      const passiveFinder = await db.characterFinder.create({ data });
      const res = await api.get(`${CHARACTERS_FINDER}/${passiveFinder.id}`);
      const deletedFinder = await db.characterFinder.findUnique({
        where: { id: passiveFinder.id },
      });
      expect(deletedFinder).toBeNull();
      TestUtils.assertNotFoundErrorRes(res);
    });

    it('should get a finder by its ID', async () => {
      const res = await api.get(`${CHARACTERS_FINDER}/${finder.id}`);
      expect(res.type).toMatch(/json/);
      expect(res.statusCode).toBe(200);
      expect(res.body).toStrictEqual(JSON.parse(JSON.stringify(finder)));
    });
  });

  describe(`POST ${CHARACTERS_FINDER}`, () => {
    it('should create an anonymous finder', async () => {
      const res = await api.post(CHARACTERS_FINDER);
      assertCharacterFinder(res);
    });

    it('should create a named finder', async () => {
      const name = 'Sherlock Holmes';
      const res = await api.post(CHARACTERS_FINDER).send({ name });
      assertCharacterFinder(res, name);
    });
  });

  describe(`PATCH ${CHARACTERS_FINDER}/:id`, () => {
    it('should respond with 400 on an invalid id', async () => {
      const finderName = 'Test Finder';
      const invalidId = 'blah123';
      const res = await api.patch(`${CHARACTERS_FINDER}/${invalidId}`).send({ name: finderName });
      const dbFinder = await db.characterFinder.findUnique({ where: { id: finder.id } });
      TestUtils.assertInvalidIdErrorRes(res);
      expect(dbFinder).toStrictEqual(finder);
    });

    it('should respond with 404 on non-existent id', async () => {
      const finderName = 'Test Finder';
      const randId = crypto.randomUUID();
      const res = await api.patch(`${CHARACTERS_FINDER}/${randId}`).send({ name: finderName });
      const dbFinder = await db.characterFinder.findUnique({ where: { id: finder.id } });
      TestUtils.assertNotFoundErrorRes(res);
      expect(dbFinder).toStrictEqual(finder);
    });

    it('should respond with 404 on an old id of a deleted finder', async () => {
      await db.characterFinder.delete({ where: { id: finder.id } });
      const finderName = 'Test Finder';
      const res = await api.patch(`${CHARACTERS_FINDER}/${finder.id}`).send({ name: finderName });
      TestUtils.assertNotFoundErrorRes(res);
    });

    it('should respond with 200 but not change the finder name if given an empty string', async () => {
      const finderName = '';
      const res = await api.patch(`${CHARACTERS_FINDER}/${finder.id}`).send({ name: finderName });
      const dbFinder = await db.characterFinder.findUnique({ where: { id: finder.id } });
      assertCharacterFinder(res, finder.name);
      expect(dbFinder).toStrictEqual(finder);
    });

    it('should respond with 200 but not change the finder name if not given a name', async () => {
      const res = await api.patch(`${CHARACTERS_FINDER}/${finder.id}`);
      const dbFinder = await db.characterFinder.findUnique({ where: { id: finder.id } });
      assertCharacterFinder(res, finder.name);
      expect(dbFinder).toStrictEqual(finder);
    });

    it('should respond with 200 and change the finder name', async () => {
      const finderName = 'Test Finder';
      const res = await api.patch(`${CHARACTERS_FINDER}/${finder.id}`).send({ name: finderName });
      assertCharacterFinder(res, finderName);
    });
  });

  describe(`POST ${CHARACTERS_EVAL}`, () => {
    const character = faker.helpers.arrayElement(characters);
    const validSelection = {
      selectedPoint: createValidPoint(character),
      characterName: character.name,
    };

    // Test finder id cases for a single selection and a list of selections
    for (const reqData of [validSelection, [validSelection, validSelection]]) {
      it('should respond with 404 on a request without the finder id', async () => {
        const res = await api.post(CHARACTERS_EVAL).send(reqData);
        expect(res.statusCode).toBe(404);
      });

      it('should respond with 404 on a request wit a non-existent finder id', async () => {
        const res = await api.post(`${CHARACTERS_EVAL}/${crypto.randomUUID()}`).send(reqData);
        TestUtils.assertNotFoundErrorRes(res);
      });

      it('should respond with 404 on a request wit a deleted finder id', async () => {
        await db.characterFinder.delete({ where: { id: finder.id } });
        const res = await api.post(`${CHARACTERS_EVAL}/${crypto.randomUUID()}`).send(reqData);
        TestUtils.assertNotFoundErrorRes(res);
      });

      it('should respond with 400 on a request wit an invalid finder id', async () => {
        const res = await api.post(`${CHARACTERS_EVAL}/invalid123`).send(reqData);
        TestUtils.assertInvalidIdErrorRes(res);
      });
    }

    it('should respond with 400 on an empty request', async () => {
      const res = await api.post(`${CHARACTERS_EVAL}/${finder.id}`);
      TestUtils.assertResponseWithValidationError(res, '');
    });

    it('should respond with 400 on an empty selection', async () => {
      const res = await api.post(`${CHARACTERS_EVAL}/${finder.id}`).send({});
      TestUtils.assertResponseWithValidationError(res, '', selectionProps.length);
    });

    it('should respond with 400 on an array of empty selections', async () => {
      const selections = [{}, {}, {}];
      const issuesCount = selectionProps.length * selections.length;
      const res = await api.post(`${CHARACTERS_EVAL}/${finder.id}`).send(selections);
      TestUtils.assertResponseWithValidationError(res, '', issuesCount);
    });

    for (const prop of selectionProps) {
      it(`should respond with 400 on a selection without '${prop}'`, async () => {
        const character = faker.helpers.arrayElement(characters);
        const selectedPoint = createValidPoint(character);
        const selection = { characterName: character.name, selectedPoint, [prop]: undefined };
        const res = await api.post(`${CHARACTERS_EVAL}/${finder.id}`).send(selection);
        TestUtils.assertResponseWithValidationError(res, prop);
      });

      it(`should respond with 400 on request with an array includes a selection without '${prop}'`, async () => {
        const selections = characters.map((character, i) => {
          const selectedPoint = createValidPoint(character);
          const selection = { characterName: character.name, selectedPoint, [prop]: undefined };
          if (i % 2 === 0) selection[prop] = undefined;
          return selection;
        });
        const issuesCount = 1 * selections.length; // One missing property per selection
        const res = await api.post(`${CHARACTERS_EVAL}/${finder.id}`).send(selections);
        TestUtils.assertResponseWithValidationError(res, prop, issuesCount);
      });
    }

    it('should respond with 200 on an empty evaluations array', async () => {
      const res = await api.post(`${CHARACTERS_EVAL}/${finder.id}`).send([]);
      const resBody = res.body as Types.EvaluationResult;
      expect(res.type).toMatch(/json/);
      expect(res.statusCode).toBe(200);
      expect(resBody.evaluations).toStrictEqual([]);
      expect(resBody.finder).toStrictEqual(JSON.parse(JSON.stringify(finder)));
    });

    it('should respond with 200, finder, and an array of a successful evaluation', async () => {
      const character = faker.helpers.arrayElement(characters);
      const selection = {
        selectedPoint: createValidPoint(character),
        characterName: character.name,
      };
      const res = await api.post(`${CHARACTERS_EVAL}/${finder.id}`).send(selection);
      const resBody = res.body as Types.EvaluationResult;
      expect(res.type).toMatch(/json/);
      expect(res.statusCode).toBe(200);
      expect(resBody.finder).toStrictEqual(JSON.parse(JSON.stringify(finder)));
      expect(resBody.evaluations).toStrictEqual([{ [selection.characterName]: true }]);
    });

    it('should respond with 200, finder, and an array of a failed evaluation', async () => {
      const character = faker.helpers.arrayElement(characters);
      const selection = {
        selectedPoint: createInvalidPoint(character),
        characterName: character.name,
      };
      const res = await api.post(`${CHARACTERS_EVAL}/${finder.id}`).send(selection);
      const resBody = res.body as Types.EvaluationResult;
      expect(res.type).toMatch(/json/);
      expect(res.statusCode).toBe(200);
      expect(resBody.evaluations).toStrictEqual([{ [selection.characterName]: false }]);
      expect(resBody.finder).toStrictEqual(JSON.parse(JSON.stringify(finder)));
    });

    it('should respond with 200, finder, and an array of a failed evaluation on a non-existent character', async () => {
      const selection = {
        selectedPoint: createValidPoint(faker.helpers.arrayElement(characters)),
        characterName: 'anonymous',
      };
      const res = await api.post(`${CHARACTERS_EVAL}/${finder.id}`).send(selection);
      const resBody = res.body as Types.EvaluationResult;
      expect(res.type).toMatch(/json/);
      expect(res.statusCode).toBe(200);
      expect(resBody.evaluations).toStrictEqual([{ [selection.characterName]: false }]);
      expect(resBody.finder).toStrictEqual(JSON.parse(JSON.stringify(finder)));
    });

    it('should respond with 200, finder (winner), and an array full of successful evaluations', async () => {
      const selections = characters.map((character) => ({
        selectedPoint: createValidPoint(character),
        characterName: character.name,
      }));
      const res = await api.post(`${CHARACTERS_EVAL}/${finder.id}`).send(selections);
      const resBody = res.body as Types.EvaluationResult;
      expect(res.type).toMatch(/json/);
      expect(res.statusCode).toBe(200);
      expect(resBody.evaluations).toBeInstanceOf(Array);
      expect(resBody.evaluations).toHaveLength(selections.length);
      for (const { characterName } of selections) {
        expect(resBody.evaluations).toContainEqual({ [characterName]: true });
      }
      expect({
        ...resBody.finder,
        duration: finder.duration,
        updatedAt: finder.updatedAt.toISOString(),
      }).toStrictEqual(JSON.parse(JSON.stringify(finder)));
      expect(new Date(resBody.finder.updatedAt).getTime()).toBeGreaterThan(
        finder.updatedAt.getTime()
      );
      expect(resBody.finder.duration).toBe(1); // We have a winner!
    });

    it('should respond with 200, finder, and an array full of failed evaluations', async () => {
      const selections = characters.map((character) => ({
        selectedPoint: createInvalidPoint(character),
        characterName: character.name,
      }));
      const res = await api.post(`${CHARACTERS_EVAL}/${finder.id}`).send(selections);
      const resBody = res.body as Types.EvaluationResult;
      expect(res.type).toMatch(/json/);
      expect(res.statusCode).toBe(200);
      expect(resBody.evaluations).toBeInstanceOf(Array);
      expect(resBody.evaluations).toHaveLength(selections.length);
      for (const { characterName } of selections) {
        expect(resBody.evaluations).toContainEqual({ [characterName]: false });
      }
      expect(resBody.finder).toStrictEqual(JSON.parse(JSON.stringify(finder)));
    });

    it('should respond with 200, finder, and a mixed array (with failed evaluation for non-existent characters)', async () => {
      const results: Record<string, boolean> = {};
      const selections = characters.map((character, i) => {
        const success = i % 2 === 0;
        results[character.name] = success;
        return {
          selectedPoint: (success ? createValidPoint : createInvalidPoint)(character),
          characterName: character.name,
        };
      });
      const anonymousSelection = {
        selectedPoint: createValidPoint(faker.helpers.arrayElement(characters)),
        characterName: 'anonymous',
      };
      selections.push(anonymousSelection);
      results[anonymousSelection.characterName] = false;
      const res = await api.post(`${CHARACTERS_EVAL}/${finder.id}`).send(selections);
      const resBody = res.body as Types.EvaluationResult;
      expect(res.type).toMatch(/json/);
      expect(res.statusCode).toBe(200);
      expect(resBody.evaluations).toBeInstanceOf(Array);
      expect(resBody.evaluations).toHaveLength(selections.length);
      for (const { characterName } of selections) {
        expect(resBody.evaluations).toContainEqual({ [characterName]: results[characterName] });
      }
      expect(resBody.finder).toStrictEqual(JSON.parse(JSON.stringify(finder)));
    });
  });
});
