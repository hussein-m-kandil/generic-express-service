/* eslint-disable security/detect-object-injection */
import * as TestUtils from './utils';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CharacterRect } from '@/../prisma/client';
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

const EVAL_CHARACTERS = `${CHARACTERS_URL}/eval`;

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

describe('Characters endpoints', () => {
  beforeAll(async () => {
    await db.characterRect.createMany({ data: characters });
  });

  afterAll(async () => {
    await db.characterRect.deleteMany({});
  });

  describe(`POST ${EVAL_CHARACTERS}`, () => {
    it('should respond with 400 on an empty request', async () => {
      const res = await api.post(EVAL_CHARACTERS);
      TestUtils.assertResponseWithValidationError(res, '');
    });

    it('should respond with 400 on an empty selection', async () => {
      const res = await api.post(EVAL_CHARACTERS).send({});
      TestUtils.assertResponseWithValidationError(res, '', selectionProps.length);
    });

    it('should respond with 400 on an array of empty selections', async () => {
      const selections = [{}, {}, {}];
      const res = await api.post(EVAL_CHARACTERS).send(selections);
      TestUtils.assertResponseWithValidationError(res, '', selectionProps.length);
    });

    for (const prop of selectionProps) {
      it(`should respond with 400 on a selection without '${prop}'`, async () => {
        const character = faker.helpers.arrayElement(characters);
        const selectedPoint = createValidPoint(character);
        const selection = { characterName: character.name, selectedPoint, [prop]: undefined };
        const res = await api.post(EVAL_CHARACTERS).send(selection);
        TestUtils.assertResponseWithValidationError(res, prop);
      });

      it(`should respond with 400 on request with an array includes a selection without '${prop}'`, async () => {
        const selections = characters.map((character, i) => {
          const selectedPoint = createValidPoint(character);
          const selection = { characterName: character.name, selectedPoint, [prop]: undefined };
          if (i % 2 === 0) selection[prop] = undefined;
          return selection;
        });
        const res = await api.post(EVAL_CHARACTERS).send(selections);
        TestUtils.assertResponseWithValidationError(res, prop);
      });
    }

    it('should respond with 404 on a selection with a non-existent character', async () => {
      const selection = {
        selectedPoint: createValidPoint(faker.helpers.arrayElement(characters)),
        characterName: 'anonymous',
      };
      const res = await api.post(EVAL_CHARACTERS).send(selection);
      TestUtils.assertNotFoundErrorRes(res);
    });

    it('should respond with 200 on an empty array', async () => {
      const res = await api.post(EVAL_CHARACTERS).send([]);
      expect(res.type).toMatch(/json/);
      expect(res.statusCode).toBe(200);
      expect(res.body).toStrictEqual([]);
    });

    it('should respond with 200 and a successful evaluation', async () => {
      const character = faker.helpers.arrayElement(characters);
      const selection = {
        selectedPoint: createValidPoint(character),
        characterName: character.name,
      };
      const res = await api.post(EVAL_CHARACTERS).send(selection);
      expect(res.type).toMatch(/json/);
      expect(res.statusCode).toBe(200);
      expect(res.body).toStrictEqual({ [selection.characterName]: true });
    });

    it('should respond with 200 and a failed evaluation', async () => {
      const character = faker.helpers.arrayElement(characters);
      const selection = {
        selectedPoint: createInvalidPoint(character),
        characterName: character.name,
      };
      const res = await api.post(EVAL_CHARACTERS).send(selection);
      expect(res.type).toMatch(/json/);
      expect(res.statusCode).toBe(200);
      expect(res.body).toStrictEqual({ [selection.characterName]: false });
    });

    it('should respond with 200 and an array full of successful evaluations', async () => {
      const selections = characters.map((character) => ({
        selectedPoint: createValidPoint(character),
        characterName: character.name,
      }));
      const res = await api.post(EVAL_CHARACTERS).send(selections);
      expect(res.type).toMatch(/json/);
      expect(res.statusCode).toBe(200);
      expect(res.body).toBeInstanceOf(Array);
      expect(res.body).toHaveLength(selections.length);
      for (const { characterName } of selections) {
        expect(res.body).toContainEqual({ [characterName]: true });
      }
    });

    it('should respond with 200 and an array full of failed evaluations', async () => {
      const selections = characters.map((character) => ({
        selectedPoint: createInvalidPoint(character),
        characterName: character.name,
      }));
      const res = await api.post(EVAL_CHARACTERS).send(selections);
      expect(res.type).toMatch(/json/);
      expect(res.statusCode).toBe(200);
      expect(res.body).toBeInstanceOf(Array);
      expect(res.body).toHaveLength(selections.length);
      for (const { characterName } of selections) {
        expect(res.body).toContainEqual({ [characterName]: false });
      }
    });

    it('should respond with 200 and a mixed array (with failed evaluation for non-existent characters)', async () => {
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
      const res = await api.post(EVAL_CHARACTERS).send(selections);
      expect(res.type).toMatch(/json/);
      expect(res.statusCode).toBe(200);
      expect(res.body).toBeInstanceOf(Array);
      expect(res.body).toHaveLength(selections.length);
      for (const { characterName } of selections) {
        expect(res.body).toContainEqual({ [characterName]: results[characterName] });
      }
    });
  });
});
