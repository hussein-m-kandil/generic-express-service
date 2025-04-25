import { z } from 'zod';
import { ADMIN_SECRET } from '../../../lib/config';

export const usernameSchema = z
  .string({
    required_error: 'Username is required',
    invalid_type_error: 'Username must be a string',
  })
  .trim()
  .min(3, 'Username must contain at least 3 character(s)')
  .max(48, 'Username must contain at most 48 character(s)');

export const fullnameSchema = z
  .string({
    required_error: 'Fullname is required',
    invalid_type_error: 'Fullname must be a string',
  })
  .trim()
  .min(3, 'Fullname must contain at least 3 character(s)')
  .max(96, 'Fullname must contain at most 96 character(s)');

export const passwordSchema = z
  .object({
    password: z
      .string({
        required_error: 'Password is required',
        invalid_type_error: 'Password must be a string',
      })
      .trim()
      .min(8)
      .max(50)
      .regex(
        /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/,
        'Password must contain a number, a special character a lowercase letter, and an uppercase letter'
      ),
    confirm: z
      .string({
        required_error: 'Password confirmation is required',
        invalid_type_error: 'Password confirmation must be a string',
      })
      .trim()
      .nonempty(),
  })
  .refine(({ password, confirm }) => password === confirm, {
    message: 'Passwords does not match',
    path: ['confirm'],
  });

export const secretSchema = z
  .string({ invalid_type_error: 'Secret must be a string' })
  .optional()
  .refine((secret) => !secret || secret === ADMIN_SECRET, {
    message: 'Invalid secret',
    path: ['secret'],
  }); // for isAdmin

export const userSchema = passwordSchema
  .and(
    z.object({
      username: usernameSchema,
      fullname: fullnameSchema,
      secret: secretSchema,
    })
  )
  .transform((data) => {
    return {
      isAdmin: Boolean(data.secret),
      username: data.username,
      fullname: data.fullname,
      password: data.password,
    };
  });

export default userSchema;
