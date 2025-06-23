import { Request, Router } from 'express';
import {
  createJwtForUser,
  findFilteredPosts,
  findFilteredVotes,
  findFilteredComments,
  getPostFilterOptionsFromReqQuery,
  getVoteFilterOptionsFromReqQuery,
  getCommentFilterOptionsFromReqQuery,
} from '../../../lib/helpers';
import { AuthResponse, NewUserInput } from '../../../types';
import { Prisma } from '../../../../prisma/generated/client';
import {
  authValidator,
  optionalAuthValidator,
  createAdminOrOwnerValidator,
} from '../../../middlewares/validators';
import userSchema, {
  secretSchema,
  usernameSchema,
  fullnameSchema,
  passwordSchema,
} from './user.schema';
import usersService from './users.service';

export const usersRouter = Router();

/*
 * NOTE: There are no restriction on any GET method,
 * because the API responding on a limited set of origins.
 * See the CORS settings in the app's entry point.
 */

usersRouter.get('/', async (req, res) => {
  const users = await usersService.getAllUsers();
  res.json(users);
});

usersRouter.get('/:id', async (req, res) => {
  const user = await usersService.findUserByIdOrThrow(req.params.id);
  res.json(user);
});

usersRouter.get('/:id/posts', optionalAuthValidator, async (req, res) => {
  const authorId = req.params.id;
  const filters = getPostFilterOptionsFromReqQuery(req);
  const userPosts = await findFilteredPosts(filters, { authorId });
  res.json(userPosts);
});

usersRouter.get('/:id/comments', optionalAuthValidator, async (req, res) => {
  const authorId = req.params.id;
  const filters = getCommentFilterOptionsFromReqQuery(req);
  const comments = await findFilteredComments(filters, { authorId });
  res.json(comments);
});

usersRouter.get('/:id/votes', optionalAuthValidator, async (req, res) => {
  const userId = req.params.id;
  const filters = getVoteFilterOptionsFromReqQuery(req);
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
