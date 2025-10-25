import * as Schema from './character.schema';
import * as Service from './characters.service';
import * as Middleware from './characters.middleware';
import { Router } from 'express';

export const charactersRouter = Router();

charactersRouter.get('/finders', Middleware.passiveFindersPurger, async (req, res) => {
  const filter = req.query.filter as 'all' | 'winner';
  res.json(await Service.getAllFinders(filter));
});

charactersRouter.get('/finders/:id', Middleware.passiveFindersPurger, async (req, res) => {
  res.json(await Service.getFinder(req.params.id));
});

charactersRouter.post('/finders', async (req, res) => {
  res.json(await Service.createFinder(Schema.finderSchema.parse(req.body)));
});

charactersRouter.patch('/finders/:id', async (req, res) => {
  res.json(await Service.updateFinder(req.params.id, Schema.finderSchema.parse(req.body)));
});

charactersRouter.post('/eval/:id', async (req, res) => {
  const characterSelection = Schema.characterSelectionSchema.parse(req.body);
  res.json(await Service.getSelectionsEvaluation(req.params.id, characterSelection));
});
