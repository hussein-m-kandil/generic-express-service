import { imagesRouter } from './images';
import { usersRouter } from './users';
import { postsRouter } from './posts';
import { authRouter } from './auth';
import { Router } from 'express';

export const apiRouter = Router();

apiRouter.use('/auth', authRouter);
apiRouter.use('/users', usersRouter);
apiRouter.use('/posts', postsRouter);
apiRouter.use('/images', imagesRouter);
