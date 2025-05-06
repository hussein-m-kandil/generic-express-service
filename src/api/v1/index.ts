import { Router } from 'express';
import authRouter from './auth';
import usersRouter from './users';
import postsRouter from './posts';

const apiRouter = Router();

apiRouter.use('/auth', authRouter);
apiRouter.use('/users', usersRouter);
apiRouter.use('/posts', postsRouter);

export default apiRouter;
