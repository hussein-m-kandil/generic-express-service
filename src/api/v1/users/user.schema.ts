import { z } from 'zod';

const PASS_REGEX =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]$/;
const PASS_ERR_MSG =
  'password must contain at least 1 uppercase letter, 1 lowercase letter, 1 number, and 1 special character';

const requiredUserSchema = z
  .object({
    username: z.string().trim().min(3).max(48),
    fullname: z.string().trim().min(3).max(96),
    password: z.string().trim().min(8).max(50).regex(PASS_REGEX, PASS_ERR_MSG),
    confirm: z.string().trim().nonempty(),
  })
  .required();

requiredUserSchema.refine(({ password, confirm }) => password === confirm, {
  message: "Passwords don't match",
  path: ['confirm'], // invalid field path
});

export const userSchema = requiredUserSchema.extend({
  secret: z.literal(process.env.ADMIN_SECRET).optional(), // for isAdmin
  isAdmin: z.boolean().default(false),
});

userSchema.transform((data) => {
  const { secret, ...userData } = data;
  userData.isAdmin = Boolean(secret);
  return userData;
});

export default userSchema;
