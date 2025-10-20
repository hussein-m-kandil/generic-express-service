import * as Utils from '@/lib/utils';
import { AppNotFoundError } from '@/lib/app-error';
import { CharacterRect } from '@/../prisma/client';
import { Selection } from './character.schema';
import db from '@/lib/db';

type SelectionEvaluation = Record<string, boolean>;

const evaluateSelection = (selection: Selection, characterRect: CharacterRect) => {
  const { x, y } = selection.selectedPoint;
  const { top, left, right, bottom } = characterRect;
  return { [selection.characterName]: x > left && y > top && x < right && y < bottom };
};

export const evaluateOneSelection = async (selection: Selection): Promise<SelectionEvaluation> => {
  const foundCharacter = await Utils.handleDBKnownErrors(
    db.characterRect.findUnique({ where: { name: selection.characterName } })
  );
  if (!foundCharacter) throw new AppNotFoundError();
  return evaluateSelection(selection, foundCharacter);
};

export const evaluateManySelections = async (
  selections: Selection[]
): Promise<SelectionEvaluation[]> => {
  const foundCharacters = await Utils.handleDBKnownErrors(
    db.characterRect.findMany({ where: { name: { in: selections.map((s) => s.characterName) } } })
  );
  const evaluations: SelectionEvaluation[] = [];
  for (const selection of selections) {
    const character = foundCharacters.find(({ name }) => name === selection.characterName);
    evaluations.push(
      character ? evaluateSelection(selection, character) : { [selection.characterName]: false }
    );
  }
  return evaluations;
};
