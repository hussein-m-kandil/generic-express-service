import { profilesRouter, lastSeenUpdater } from './profiles';
import { charactersRouter } from './characters';
import { imagesRouter } from './images';
import { statsRouter } from './stats';
import { usersRouter } from './users';
import { postsRouter } from './posts';
import { chatsRouter } from './chats';
import { authRouter } from './auth';
import { Router } from 'express';

export const apiRouter = Router();

apiRouter.use(lastSeenUpdater);

apiRouter.use('/auth', authRouter);
apiRouter.use('/users', usersRouter);
apiRouter.use('/posts', postsRouter);
apiRouter.use('/chats', chatsRouter);
apiRouter.use('/stats', statsRouter);
apiRouter.use('/images', imagesRouter);
apiRouter.use('/profiles', profilesRouter);
apiRouter.use('/characters', charactersRouter);
