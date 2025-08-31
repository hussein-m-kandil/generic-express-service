import * as Types from '@/types';
import * as Utils from '@/lib/utils';
import * as Schema from './user.schema';
import * as Service from './users.service';
import * as Validators from '@/middlewares/validators';
import { Router, Request } from 'express';

export const usersRouter = Router();

usersRouter.get(
  '/',
  Validators.authValidator,
  Validators.adminValidator,
  async (req, res) => {
    const filters = Utils.getPaginationFiltersFromReqQuery(req);
    const users = await Service.getAllUsers(filters);
    res.json(users);
  }
);

usersRouter.get('/:idOrUsername', async (req, res) => {
  const { idOrUsername } = req.params;
  res.json(await Service.findUserByIdOrByUsernameOrThrow(idOrUsername));
});

usersRouter.post('/', async (req, res) => {
  const parsedNewUser = Schema.userSchema.parse(req.body);
  const createdUser = await Service.createUser(parsedNewUser);
  const signupRes: Types.AuthResponse = {
    token: Utils.createJwtForUser(createdUser),
    user: createdUser,
  };
  res.status(201).json(signupRes);
});

usersRouter.post('/guest', async (req, res) => {
  const [randVal, ...randVals] = crypto.randomUUID().split('-');
  const randNum = Date.now() % 100000;
  const questUser = await Service.createUser({
    bio:
      'Consider updating your profile data, especially the password, ' +
      'to be able to sign in to this profile again.',
    password: `G_${randVals.slice(1, 3).join('_')}`,
    username: `guest_${randVal}${randNum}`,
    fullname: `Guest ${randVal}${randNum}`,
    isAdmin: false,
  });
  const signupRes: Types.AuthResponse = {
    token: Utils.createJwtForUser(questUser),
    user: questUser,
  };
  res.status(201).json(signupRes);
});

usersRouter.patch(
  '/:id',
  Validators.authValidator,
  Validators.createAdminOrOwnerValidator((req) => req.params.id),
  async (req: Request<{ id: string }, unknown, Types.NewUserInput>, res) => {
    const data = Schema.createUpdateUserSchema(req.body).parse(req.body);
    const updatedUser = await Service.updateUser(req.params.id, data);
    const resBody: Types.AuthResponse = {
      token: req.headers.authorization ?? '',
      user: updatedUser,
    };
    res.json(resBody);
  }
);

usersRouter.delete(
  '/:id',
  Validators.authValidator,
  Validators.createAdminOrOwnerValidator((req) => req.params.id),
  async (req, res) => {
    await Service.deleteUser(req.params.id);
    res.status(204).end();
  }
);
