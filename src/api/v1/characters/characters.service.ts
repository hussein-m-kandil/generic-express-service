import * as Types from '@/types';
import * as Utils from '@/lib/utils';
import { CharacterFinder, CharacterRect } from '@/../prisma/client';
import { ValidFinder, ValidSelections } from './character.schema';
import { AppNotFoundError } from '@/lib/app-error';
import db from '@/lib/db';

export const PASSIVE_PERIOD_MS = 3 * 24 * 60 * 60 * 1000;

export const purgePassiveFindersDBQuery = async () => {
  return await Utils.handleDBKnownErrors(
    db.characterFinder.deleteMany({
      where: { updatedAt: { lte: new Date(Date.now() - PASSIVE_PERIOD_MS) }, duration: null },
    })
  );
};

export const getAllFinders = async (filter: 'all' | 'winner') => {
  return await Utils.handleDBKnownErrors(
    db.characterFinder.findMany({
      ...(filter === 'all' ? {} : { where: { duration: { not: null } } }),
      orderBy: [{ duration: { sort: 'asc', nulls: 'last' } }, { updatedAt: 'desc' }],
    })
  );
};

export const getFinder = async (id: CharacterFinder['id']) => {
  const finder = await Utils.handleDBKnownErrors(db.characterFinder.findUnique({ where: { id } }));
  if (!finder) throw new AppNotFoundError('finder not found');
  return finder;
};

export const createFinder = async ({ name }: ValidFinder) => {
  const dbQuery = db.characterFinder.create({ data: { name } });
  return await Utils.handleDBKnownErrors(dbQuery);
};

export const updateFinder = async (id: CharacterFinder['id'], { name }: ValidFinder) => {
  const dbQuery = db.characterFinder.update({ where: { id }, data: { name } });
  return await Utils.handleDBKnownErrors(dbQuery);
};

const evaluateOneSelection = (selection: ValidSelections[0], characterRect: CharacterRect) => {
  const { x, y } = selection.selectedPoint;
  const { top, left, right, bottom } = characterRect;
  return { [selection.characterName]: x > left && y > top && x < right && y < bottom };
};

const evaluateManySelections = (selections: ValidSelections, characterRects: CharacterRect[]) => {
  let foundCharactersCount = 0;
  const evaluations: Types.SelectionEvaluation[] = [];
  for (const selection of selections) {
    const character = characterRects.find(({ name }) => name === selection.characterName);
    if (character) {
      const evaluationResult = evaluateOneSelection(selection, character);
      const found = evaluationResult[selection.characterName];
      if (found) foundCharactersCount++;
      evaluations.push(evaluationResult);
    } else {
      evaluations.push({ [selection.characterName]: false });
    }
  }
  const foundAll = foundCharactersCount > 0 && foundCharactersCount === characterRects.length;
  return { evaluations, foundAll };
};

const saveFinderAsWinner = async (finder: CharacterFinder) => {
  const duration = Math.ceil((Date.now() - finder.createdAt.getTime()) / 1000); // in seconds
  const dbQuery = db.characterFinder.update({ where: { id: finder.id }, data: { duration } });
  return await Utils.handleDBKnownErrors(dbQuery);
};

export const getSelectionsEvaluation = async (
  id: CharacterFinder['id'],
  selections: ValidSelections
): Promise<Types.EvaluationResult> => {
  const [finder, characterRects] = await Utils.handleDBKnownErrors(
    db.$transaction([
      db.characterFinder.findUnique({ where: { id } }),
      db.characterRect.findMany({}),
    ])
  );
  if (!finder) throw new AppNotFoundError('finder not found');
  const { evaluations, foundAll } = evaluateManySelections(selections, characterRects);
  if (foundAll) {
    const winner = await saveFinderAsWinner(finder);
    return { evaluations, finder: winner };
  }
  return { evaluations, finder };
};
