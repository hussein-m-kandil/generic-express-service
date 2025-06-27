import { AppNotFoundError } from '../../../lib/app-error';
import {
  NewPostParsedData,
  NewCommentParsedData,
  NewPostAuthorizedData,
  PostFullData,
} from '../../../types';
import {
  handleDBKnownErrors,
  fieldsToIncludeWithPost,
  fieldsToIncludeWithComment,
} from '../../../lib/helpers';
import { Prisma } from '../../../../prisma/generated/client';
import db from '../../../lib/db';

const include = fieldsToIncludeWithPost;

export const getAllCategories = async () => await db.category.findMany({});

export const createPost = async (data: NewPostAuthorizedData) => {
  const dbQuery = db.post.create({
    data: {
      title: data.title,
      imageId: data.image,
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
            imageId: data.image,
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

export const deletePost = async (post: PostFullData, authorId?: string) => {
  const delPostQ = db.post.delete({
    where: {
      id: post.id,
      AND: authorId
        ? { OR: [{ published: true }, { authorId }] }
        : { published: true },
    },
  });
  // Delete the post with its image if both owned by the same user
  if (post.authorId === post.image?.ownerId) {
    const sameImagePosts = await handleDBKnownErrors(
      db.post.findMany({ where: { imageId: post.image.id } })
    );
    // Delete the post with its image if there are no other posts using it
    if (sameImagePosts.length === 1 && sameImagePosts[0].id === post.id) {
      const delImgQ = db.image.delete({ where: { id: post.image.id } });
      return await handleDBKnownErrors(db.$transaction([delPostQ, delImgQ]));
    }
  }
  // Otherwise, only delete the post and leave its image alone ;)
  return await handleDBKnownErrors(delPostQ);
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
    include: fieldsToIncludeWithComment,
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
  getAllCategories,
  countPostVotes,
  downvotePost,
  createPost,
  updatePost,
  upvotePost,
  deletePost,
};

export default postsService;
