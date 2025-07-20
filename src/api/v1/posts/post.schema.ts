import { z } from 'zod';

const getRequiredAndTypeErrors = (
  name: string,
  type = 'string',
  optional = false
) => {
  const messages: {
    required_error?: string;
    invalid_type_error: string;
  } = { invalid_type_error: `${name} must be of type ${type}` };
  if (!optional) messages.required_error = `${name} is required`;
  return messages;
};

export const titleSchema = z
  .string(getRequiredAndTypeErrors('Title'))
  .trim()
  .nonempty('A post must have a title');

export const imageSchema = z
  .string()
  .trim()
  .uuid({ message: 'expect image to be UUID' })
  .optional();

export const contentSchema = z
  .string(getRequiredAndTypeErrors('Post-Content'))
  .trim()
  .nonempty('A post must have content');

export const publishedSchema = z.boolean(
  getRequiredAndTypeErrors('Published flag', 'boolean', true)
);

export const categorySchema = z
  .string(getRequiredAndTypeErrors('Category'))
  .trim();

export const categoriesSchema = z
  .array(categorySchema)
  .max(7)
  .transform((categories) => {
    return Array.from(
      new Set(categories.filter((c) => Boolean(c)).map((c) => c.toLowerCase()))
    );
  });

export const commentSchema = z.object({
  content: z
    .string(getRequiredAndTypeErrors('Comment-Content'))
    .trim()
    .nonempty('A comment must have content'),
});

export const postSchema = z
  .object({
    title: titleSchema,
    image: imageSchema,
    content: contentSchema,
    published: publishedSchema.optional(),
    categories: categoriesSchema.optional(),
  })
  .transform((data) => {
    return { ...data, categories: data.categories ?? [] };
  });

export default postSchema;
