import { AppNotFoundError } from '../../../lib/app-error';
import {
  NewCommentParsedData,
  NewPostAuthorizedData,
  NewPostParsedData,
} from '../../../types';
import { handleDBKnownErrors } from '../../../lib/helpers';
import db from '../../../lib/db';
import { Prisma } from '../../../../prisma/generated/client';

const include = { comments: true, categories: true, votes: true };

export const getAllCategories = async () => await db.category.findMany({});

export const getAllPosts = async (options?: {
  authorId?: string;
  text?: string;
  categories?: string[];
}) => {
  const baseWhereClause = options?.authorId
    ? { OR: [{ published: true }, { authorId: options.authorId }] }
    : { published: true };
  const dbQuery = db.post.findMany({
    where: {
      ...baseWhereClause,
      AND: {
        OR: [
          {
            OR: options?.text
              ? [
                  { title: { contains: options.text, mode: 'insensitive' } },
                  { content: { contains: options.text, mode: 'insensitive' } },
                ]
              : [],
          },
          options?.categories
            ? {
                categories: {
                  some: {
                    categoryName: {
                      in: options.categories,
                      mode: 'insensitive',
                    },
                  },
                },
              }
            : {},
        ],
      },
    },
    include,
  });
  return await handleDBKnownErrors(dbQuery);
};

export const createPost = async (data: NewPostAuthorizedData) => {
  const dbQuery = db.post.create({
    data: {
      title: data.title,
      content: data.content,
      authorId: data.authorId,
      published: data.published,
      categories: {
        create: data.categories.map((name) => ({
          category: {
            connectOrCreate: { where: { name }, create: { name } },
          },
        })),
      },
    },
    include,
  });
  const handlerOptions = { uniqueFieldName: 'category' };
  const createdPost = await handleDBKnownErrors(dbQuery, handlerOptions);
  return createdPost;
};

export const findPostByIdOrThrow = async (id: string, authorId?: string) => {
  const dbQuery = db.post.findUnique({
    where: {
      id,
      AND: authorId
        ? { OR: [{ published: true }, { authorId }] }
        : { published: true },
    },
    include,
  });
  const post = await handleDBKnownErrors(dbQuery);
  if (!post) throw new AppNotFoundError('Post Not Found');
  return post;
};

export const updatePost = async (id: string, data: NewPostParsedData) => {
  const dbQuery = (async () =>
    (
      await db.$transaction([
        db.categoriesOnPosts.deleteMany({ where: { postId: id } }),
        db.post.update({
          where: { id },
          data: {
            title: data.title,
            content: data.content,
            published: data.published,
            categories: {
              create: data.categories.map((name) => ({
                category: {
                  connectOrCreate: { where: { name }, create: { name } },
                },
              })),
            },
          },
          include,
        }),
      ])
    )[1])();
  const handlerOptions = {
    notFoundErrMsg: 'Post not found',
    uniqueFieldName: 'category',
  };
  const post = await handleDBKnownErrors(dbQuery, handlerOptions);
  return post;
};

export const getAllPostVotes = async (postId: string, authorId?: string) => {
  return (await findPostByIdOrThrow(postId, authorId)).votes;
};

export const upvotePost = async (postId: string, userId: string) => {
  const dbQuery = db.post.update({
    where: {
      id: postId,
      AND: { OR: [{ published: true }, { authorId: userId }] },
    },
    data: {
      votes: {
        connectOrCreate: {
          where: { userId_postId: { postId, userId } },
          create: { userId },
        },
      },
    },
    include,
  });
  const handlerOptions = {
    notFoundErrMsg: 'Post not found',
    uniqueFieldName: 'user-upvote',
  };
  const post = await handleDBKnownErrors(dbQuery, handlerOptions);
  return post;
};

export const downvotePost = async (postId: string, userId: string) => {
  const dbQuery = db.post.update({
    where: {
      id: postId,
      AND: { OR: [{ published: true }, { authorId: userId }] },
    },
    data: { votes: { delete: { userId_postId: { postId, userId } } } },
    include,
  });
  const handlerOptions = {
    notFoundErrMsg: 'Post not found',
    uniqueFieldName: 'user-upvote',
  };
  try {
    const post = await handleDBKnownErrors(dbQuery, handlerOptions);
    return post;
  } catch (error) {
    const connectionDoesNotExist =
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2017';
    if (connectionDoesNotExist) {
      return findPostByIdOrThrow(postId);
    } else {
      throw error;
    }
  }
};

export const deletePost = async (id: string, authorId?: string) => {
  const dbQuery = db.post.delete({
    where: {
      id,
      AND: authorId
        ? { OR: [{ published: true }, { authorId }] }
        : { published: true },
    },
  });
  await handleDBKnownErrors(dbQuery);
};

export const findPostCommentByCompoundIdOrThrow = async (
  postId: string,
  commentId: string,
  authorId?: string
) => {
  const dbQuery = db.comment.findUnique({
    where: {
      id: commentId,
      AND: {
        postId,
        AND: authorId
          ? { OR: [{ post: { published: true } }, { post: { authorId } }] }
          : { post: { published: true } },
      },
    },
  });
  const comment = await handleDBKnownErrors(dbQuery);
  if (!comment) throw new AppNotFoundError('Post/Comment Not Found');
  return comment;
};

export const findPostByIdAndCreateComment = async (
  postId: string,
  commentAuthorId: string,
  data: NewCommentParsedData
) => {
  const dbQuery = db.post.update({
    where: {
      id: postId,
      AND: { OR: [{ published: true }, { authorId: commentAuthorId }] },
    },
    data: { comments: { create: { ...data, authorId: commentAuthorId } } },
    include,
  });
  const handlerOptions = { notFoundErrMsg: 'Post/Comment Not Found' };
  const updatedPost = await handleDBKnownErrors(dbQuery, handlerOptions);
  return updatedPost;
};

export const findPostCommentByCompoundIdAndUpdate = async (
  postId: string,
  commentId: string,
  commentAuthorId: string,
  data: NewCommentParsedData
) => {
  const dbQuery = db.post.update({
    where: {
      id: postId,
      AND: { OR: [{ published: true }, { authorId: commentAuthorId }] },
    },
    data: { comments: { update: { where: { id: commentId }, data } } },
    include,
  });
  const handlerOptions = { notFoundErrMsg: 'Post/Comment Not Found' };
  const updatedPost = await handleDBKnownErrors(dbQuery, handlerOptions);
  return updatedPost;
};

export const findPostCommentByCompoundIdAndDelete = async (
  postId: string,
  commentId: string,
  postAuthorId?: string
) => {
  const dbQuery = db.comment.delete({
    where: {
      id: commentId,
      AND: postAuthorId
        ? {
            OR: [
              { post: { published: true } },
              { post: { authorId: postAuthorId } },
            ],
          }
        : { post: { published: true } },
    },
  });
  await handleDBKnownErrors(dbQuery);
};

export const findPostComments = async (postId: string, authorId?: string) => {
  return (await findPostByIdOrThrow(postId, authorId)).comments;
};

export const findPostCategories = async (postId: string, authorId?: string) => {
  return (await findPostByIdOrThrow(postId, authorId)).categories;
};

export const countPostsByAuthorId = async (authorId: string) => {
  const dbQuery = db.post.count({ where: { authorId } });
  const postsCount = await handleDBKnownErrors(dbQuery);
  return postsCount;
};

export const countPostsCommentsByPostsAuthorId = async (authorId: string) => {
  const dbQuery = db.comment.count({ where: { post: { authorId } } });
  const commentsCount = await handleDBKnownErrors(dbQuery);
  return commentsCount;
};

export const countPostsVotesByPostsAuthorId = async (authorId: string) => {
  const dbQuery = db.voteOnPost.count({ where: { post: { authorId } } });
  const votesCount = await handleDBKnownErrors(dbQuery);
  return votesCount;
};

export const countPostsCategoriesByPostsAuthorId = async (authorId: string) => {
  const dbQuery = db.categoriesOnPosts.findMany({
    where: { post: { authorId } },
    distinct: ['categoryName'],
  });
  const postDistinctCategories = await handleDBKnownErrors(dbQuery);
  return postDistinctCategories.length;
};

export const countPostCategories = async (
  postId: string,
  authorId?: string
) => {
  return (await findPostByIdOrThrow(postId, authorId)).categories.length;
};

export const countPostComments = async (postId: string, authorId?: string) => {
  return (await findPostByIdOrThrow(postId, authorId)).comments.length;
};

export const countPostVotes = async (postId: string, authorId?: string) => {
  return (await findPostByIdOrThrow(postId, authorId)).comments.length;
};

export const postsService = {
  findPostCommentByCompoundIdAndDelete,
  findPostCommentByCompoundIdAndUpdate,
  countPostsCategoriesByPostsAuthorId,
  findPostCommentByCompoundIdOrThrow,
  countPostsCommentsByPostsAuthorId,
  countPostsVotesByPostsAuthorId,
  findPostByIdAndCreateComment,
  countPostsByAuthorId,
  findPostByIdOrThrow,
  countPostCategories,
  findPostCategories,
  countPostComments,
  findPostComments,
  getAllCategories,
  getAllPostVotes,
  countPostVotes,
  downvotePost,
  getAllPosts,
  createPost,
  updatePost,
  upvotePost,
  deletePost,
};

export default postsService;
