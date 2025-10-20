import { charactersRouter } from './characters';
import { imagesRouter } from './images';
import { statsRouter } from './stats';
import { usersRouter } from './users';
import { postsRouter } from './posts';
import { authRouter } from './auth';
import { Router } from 'express';

export const apiRouter = Router();

apiRouter.use('/auth', authRouter);
apiRouter.use('/users', usersRouter);
apiRouter.use('/posts', postsRouter);
apiRouter.use('/stats', statsRouter);
apiRouter.use('/images', imagesRouter);
apiRouter.use('/characters', charactersRouter);
