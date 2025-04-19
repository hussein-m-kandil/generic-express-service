import { z } from 'zod';

const PASS_MIN_LEN = 8;
const PASS_REGEX = new RegExp(
  `^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[@$!%*?&])[A-Za-z\\d@$!%*?&]{${PASS_MIN_LEN},}$`
);
const PASS_ERR_MSG =
  'password must contain at least 1 uppercase letter, 1 lowercase letter, 1 number, and 1 special character';

export const userSchema = z
  .object({
    username: z.string().trim().min(3).max(48),
    fullname: z.string().trim().min(3).max(96),
    password: z
      .string()
      .trim()
      .min(PASS_MIN_LEN)
      .max(50)
      .regex(PASS_REGEX, PASS_ERR_MSG),
    confirm: z.string().trim().nonempty(),
    secret: z.string().optional(), // for isAdmin
  })
  .refine(({ password, confirm }) => password === confirm, {
    message: 'Passwords does not match',
    path: ['confirm'],
  })
  .refine(({ secret }) => !secret || secret === process.env.ADMIN_SECRET, {
    message: 'Invalid secret',
    path: ['secret'],
  })
  .transform((data) => {
    return {
      isAdmin: Boolean(data.secret),
      username: data.username,
      fullname: data.fullname,
      password: data.password,
    };
  });

export default userSchema;
