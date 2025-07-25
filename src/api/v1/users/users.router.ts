import {
  createJwtForUser,
  findFilteredPosts,
  findFilteredVotes,
  findFilteredComments,
  getPostFiltersFromReqQuery,
  getVoteFiltersFromReqQuery,
  getPaginationFiltersFromReqQuery,
  getCommentFiltersFromReqQuery,
} from '../../../lib/helpers';
import { AuthResponse, NewUserInput } from '../../../types';
import { Prisma } from '../../../../prisma/generated/client';
import {
  authValidator,
  adminValidator,
  optionalAuthValidator,
  createAdminOrOwnerValidator,
} from '../../../middlewares/validators';
import userSchema, {
  secretSchema,
  usernameSchema,
  fullnameSchema,
  passwordSchema,
} from './user.schema';
import { NextFunction, Request, Router } from 'express';
import usersService from './users.service';

export const usersRouter = Router();

usersRouter.get('/', authValidator, adminValidator, async (req, res) => {
  const filters = getPaginationFiltersFromReqQuery(req);
  const users = await usersService.getAllUsers(filters);
  res.json(users);
});

usersRouter.get(
  '/:idOrUsername',
  optionalAuthValidator,
  async (req, res, next) => {
    const param = req.params.idOrUsername;
    const user = await usersService.findUserByIdOrByUsernameOrThrow(param);
    if (param === user.id) {
      res.json(user);
    } else {
      const nextWrapper: NextFunction = (x: unknown) => {
        if (x) next(x);
        else res.json(user);
      };
      await createAdminOrOwnerValidator(() => user.id)(req, res, nextWrapper);
    }
  }
);

usersRouter.get('/:id/posts', optionalAuthValidator, async (req, res) => {
  const authorId = req.params.id;
  const filters = getPostFiltersFromReqQuery(req);
  const userPosts = await findFilteredPosts(filters, { authorId });
  res.json(userPosts);
});

usersRouter.get('/:id/comments', optionalAuthValidator, async (req, res) => {
  const authorId = req.params.id;
  const filters = getCommentFiltersFromReqQuery(req);
  const comments = await findFilteredComments(filters, { authorId });
  res.json(comments);
});

usersRouter.get('/:id/votes', optionalAuthValidator, async (req, res) => {
  const userId = req.params.id;
  const filters = getVoteFiltersFromReqQuery(req);
  const votes = await findFilteredVotes(filters, { userId });
  res.json(votes);
});

usersRouter.post('/', async (req, res) => {
  const parsedNewUser = userSchema.parse(req.body);
  const createdUser = await usersService.createUser(parsedNewUser);
  const signupRes: AuthResponse = {
    token: createJwtForUser(createdUser),
    user: createdUser,
  };
  res.status(201).json(signupRes);
});

usersRouter.patch(
  '/:id',
  authValidator,
  createAdminOrOwnerValidator((req) => req.params.id),
  async (req: Request<{ id: string }, unknown, NewUserInput>, res) => {
    const { username, fullname, password, confirm, secret } = req.body;
    const data: Prisma.UserUpdateInput = {};
    if (username) data.username = usernameSchema.parse(username);
    if (fullname) data.fullname = fullnameSchema.parse(fullname);
    if (password) {
      data.password = passwordSchema.parse({
        password: password,
        confirm,
      }).password;
    }
    if (secret && secretSchema.parse(secret)) data.isAdmin = true;
    await usersService.updateUser(req.params.id, data);
    res.status(204).end();
  }
);

usersRouter.delete(
  '/:id',
  authValidator,
  createAdminOrOwnerValidator((req) => req.params.id),
  async (req, res) => {
    await usersService.deleteUser(req.params.id);
    res.status(204).end();
  }
);

export default usersRouter;
