import * as service from './characters.service';
import * as schema from './character.schema';
import { Router } from 'express';

export const charactersRouter = Router();

charactersRouter.post('/eval', async (req, res) => {
  if (Array.isArray(req.body)) {
    const selections = req.body.map((selection) => schema.selectionSchema.parse(selection));
    res.json(await service.evaluateManySelections(selections));
  } else {
    const selection = schema.selectionSchema.parse(req.body);
    res.json(await service.evaluateOneSelection(selection));
  }
});
