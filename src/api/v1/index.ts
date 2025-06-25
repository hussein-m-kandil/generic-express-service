import { Router } from 'express';
import authRouter from './auth';
import usersRouter from './users';
import postsRouter from './posts';
import imagesRouter from './images';

const apiRouter = Router();

apiRouter.use('/auth', authRouter);
apiRouter.use('/users', usersRouter);
apiRouter.use('/posts', postsRouter);
apiRouter.use('/images', imagesRouter);

export default apiRouter;
