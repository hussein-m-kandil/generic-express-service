import { ADMIN_SECRET } from '@/lib/config';
import { z } from 'zod';

export const avatarIdSchema = z
  .string()
  .trim()
  .uuid({ message: 'Expect image to be UUID' })
  .optional();

export const bioSchema = z
  .string({ invalid_type_error: 'User bio must be a string' })
  .trim()
  .optional();

export const usernameSchema = z
  .string({
    required_error: 'Username is required',
    invalid_type_error: 'Username must be a string',
  })
  .trim()
  .regex(
    /^\w+$/,
    'Username Can only have letters, numbers, and underscores (_)'
  )
  .min(3, 'Username must contain at least 3 characters')
  .max(48, 'Username must contain at most 48 characters');

export const fullnameSchema = z
  .string({
    required_error: 'Fullname is required',
    invalid_type_error: 'Fullname must be a string',
  })
  .trim()
  .min(3, 'Fullname must contain at least 3 characters')
  .max(96, 'Fullname must contain at most 96 characters');

export const passwordSchema = z
  .string({
    required_error: 'Password is required',
    invalid_type_error: 'Password must be a string',
  })
  .trim()
  .min(8, 'Password must contain at least 8 characters')
  .max(50, 'Password must contain at most 50 characters')
  .regex(
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^a-zA-Z\d]).{8,}$/,
    'Password must contain a number, a special character a lowercase letter, and an uppercase letter'
  );

export const passConfSchema = z
  .string({
    required_error: 'Password confirmation is required',
    invalid_type_error: 'Password confirmation must be a string',
  })
  .trim()
  .nonempty('Password confirmation is required');

export const secretSchema = z
  .string({ invalid_type_error: 'Secret must be a string' })
  .trim()
  .optional()
  .refine((secret) => !secret || secret === ADMIN_SECRET, {
    message: 'Invalid secret',
    path: ['secret'],
  }); // for isAdmin

const userObjectSchema = z.object({
  avatarId: avatarIdSchema,
  username: usernameSchema,
  fullname: fullnameSchema,
  password: passwordSchema,
  confirm: passConfSchema,
  secret: secretSchema,
  bio: bioSchema,
});

export type UserObjectSchemaOut = z.output<typeof userObjectSchema>;
export type PartialUserObjectSchemaOut = z.output<
  ReturnType<typeof userObjectSchema.partial>
>;

export const refinePassConfCheck = (
  data: UserObjectSchemaOut | PartialUserObjectSchemaOut
) => {
  return data.password === data.confirm;
};

export const refinePassConfMessage = {
  message: 'Passwords does not match',
  path: ['confirm'],
};

export const refinePassConfArgs: [
  typeof refinePassConfCheck,
  typeof refinePassConfMessage
] = [refinePassConfCheck, refinePassConfMessage];

export const transformUserObject = <
  T extends UserObjectSchemaOut | PartialUserObjectSchemaOut
>({
  confirm: _,
  secret,
  ...data
}: T) => {
  type TransformedData = typeof data & { isAdmin?: boolean };
  const result: TransformedData = { ...data };
  if (secret) result.isAdmin = Boolean(secret);
  return result;
};

export const userSchema = userObjectSchema
  .refine(...refinePassConfArgs)
  .transform(transformUserObject<UserObjectSchemaOut>);

export const createUpdateUserSchema = (
  partialData: PartialUserObjectSchemaOut
) => {
  const partialUserSchema =
    partialData.password || partialData.confirm
      ? userObjectSchema.partial().required({ password: true, confirm: true })
      : userObjectSchema.partial();
  return partialUserSchema
    .refine(...refinePassConfArgs)
    .transform(transformUserObject<PartialUserObjectSchemaOut>);
};
