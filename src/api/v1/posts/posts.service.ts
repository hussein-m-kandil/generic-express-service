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

export const getAllPosts = async () => {
  return await db.post.findMany({ include });
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

export const findPostByIdOrThrow = async (id: string) => {
  const dbQuery = db.post.findUnique({ where: { id }, include });
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

export const getAllPostVotes = async (postId: string) => {
  const dbQuery = db.votesOnPosts.findMany({ where: { postId } });
  const postVotes = await handleDBKnownErrors(dbQuery);
  return postVotes;
};

export const upvotePost = async (postId: string, userId: string) => {
  const dbQuery = db.post.update({
    where: { id: postId },
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
    where: { id: postId },
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

export const deletePost = async (id: string) => {
  try {
    const dbQuery = db.post.delete({ where: { id } });
    await handleDBKnownErrors(dbQuery);
  } catch (error) {
    if (!(error instanceof AppNotFoundError)) throw error;
  }
};

export const findPostCommentByCompoundIdOrThrow = async (
  postId: string,
  commentId: string
) => {
  const dbQuery = db.comment.findUnique({
    where: { id: commentId, AND: { postId } },
  });
  const comment = await handleDBKnownErrors(dbQuery);
  if (!comment) throw new AppNotFoundError('Post/Comment Not Found');
  return comment;
};

export const findPostByIdAndCreateComment = async (
  postId: string,
  authorId: string,
  data: NewCommentParsedData
) => {
  const dbQuery = db.comment.create({ data: { ...data, authorId, postId } });
  const handlerOptions = { notFoundErrMsg: 'Post/Comment Not Found' };
  const createdPost = await handleDBKnownErrors(dbQuery, handlerOptions);
  return createdPost;
};

export const findPostCommentByCompoundIdAndUpdate = async (
  postId: string,
  authorId: string,
  commentId: string,
  data: NewCommentParsedData
) => {
  const dbQuery = db.comment.update({
    where: { id: commentId, AND: { postId, authorId } },
    data,
  });
  const handlerOptions = { notFoundErrMsg: 'Post/Comment Not Found' };
  const comment = await handleDBKnownErrors(dbQuery, handlerOptions);
  return comment;
};

export const findPostCommentByCompoundIdAndDelete = async (
  postId: string,
  commentId: string
) => {
  try {
    const dbQuery = db.comment.delete({
      where: { id: commentId, AND: { postId } },
    });
    await handleDBKnownErrors(dbQuery);
  } catch (error) {
    if (!(error instanceof AppNotFoundError)) throw error;
  }
};

export const postsService = {
  findPostCommentByCompoundIdAndDelete,
  findPostCommentByCompoundIdAndUpdate,
  findPostCommentByCompoundIdOrThrow,
  findPostByIdAndCreateComment,
  findPostByIdOrThrow,
  getAllPostVotes,
  downvotePost,
  getAllPosts,
  createPost,
  updatePost,
  upvotePost,
  deletePost,
};

export default postsService;
