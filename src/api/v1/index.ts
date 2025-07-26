import * as Exp from 'express';
import { imagesRouter } from './images';
import { usersRouter } from './users';
import { postsRouter } from './posts';
import { authRouter } from './auth';

export const apiRouter = Exp.Router();

apiRouter.use('/auth', authRouter);
apiRouter.use('/users', usersRouter);
apiRouter.use('/posts', postsRouter);
apiRouter.use('/images', imagesRouter);
