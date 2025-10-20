import * as service from './characters.service';
import { NextFunction, Request, Response } from 'express';

export const passiveFindersPurger = async (req: Request, res: Response, next: NextFunction) => {
  await service.purgePassiveFindersDBQuery();
  next();
};
