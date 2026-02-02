import * as Types from '@/types';
import * as Utils from '@/lib/utils';
import { CharacterFinder, CharacterRect } from '@/../prisma/client';
import { ValidFinder, CharacterSelection, Point } from './character.schema';
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

const isCharacterFound = ({ x, y }: Point, { top, left, right, bottom }: CharacterRect) => {
  return x > left && y > top && x < right && y < bottom;
};

const evaluateSelection = (
  characterSelection: CharacterSelection,
  characterRects: CharacterRect[]
) => {
  let foundCharactersNum = 0;
  const evaluation: Types.EvaluationResult['evaluation'] = {};
  const selectionEntries = Object.entries(characterSelection);
  for (const [characterName, selectedPoint] of selectionEntries) {
    const characterRect = characterRects.find((cr) => cr.name === characterName);
    const characterFound = characterRect ? isCharacterFound(selectedPoint, characterRect) : false;
    // eslint-disable-next-line security/detect-object-injection
    evaluation[characterName] = characterFound;
    if (characterFound) foundCharactersNum++;
  }
  const allCharactersFound = foundCharactersNum > 0 && foundCharactersNum === characterRects.length;
  return { evaluation, allCharactersFound };
};

const saveFinderAsWinner = async (finder: CharacterFinder) => {
  if (finder.duration !== null) {
    return finder; // So, it won before, and it already has the shortest duration
  }
  const duration = Math.ceil((Date.now() - finder.createdAt.getTime()) / 1000); // in seconds
  const dbQuery = db.characterFinder.update({ where: { id: finder.id }, data: { duration } });
  return await Utils.handleDBKnownErrors(dbQuery);
};

export const getSelectionsEvaluation = async (
  id: CharacterFinder['id'],
  selections: CharacterSelection
): Promise<Types.EvaluationResult> => {
  const [finder, characterRects] = await Utils.handleDBKnownErrors(
    db.$transaction([
      db.characterFinder.findUnique({ where: { id } }),
      db.characterRect.findMany({}),
    ])
  );
  if (!finder) throw new AppNotFoundError('finder not found');
  const { evaluation, allCharactersFound } = evaluateSelection(selections, characterRects);
  if (allCharactersFound) {
    const winner = await saveFinderAsWinner(finder);
    return { evaluation, finder: winner };
  }
  return { evaluation, finder };
};
