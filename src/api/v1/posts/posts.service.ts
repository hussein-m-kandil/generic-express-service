import {
  PostFilters,
  VoteFilters,
  PostFullData,
  CommentFilters,
  CategoriesFilter,
  NewPostParsedData,
  NewCommentParsedData,
  NewPostAuthorizedData,
} from '../../../types';
import {
  getPaginationArgs,
  handleDBKnownErrors,
  fieldsToIncludeWithPost,
  fieldsToIncludeWithVote,
  fieldsToIncludeWithComment,
} from '../../../lib/helpers';
import { Prisma } from '../../../../prisma/generated/client';
import { AppNotFoundError } from '../../../lib/app-error';
import db from '../../../lib/db';

export const getPrivatePostProtectionArgs = (authorId?: string) => {
  return authorId
    ? { OR: [{ published: true }, { authorId }] }
    : { published: true };
};

export const getAggregatePrivatePostProtectionArgs = (authorId?: string) => {
  return authorId
    ? { OR: [{ post: { published: true } }, { post: { authorId } }] }
    : { post: { published: true } };
};

export const getCategories = async (categories?: CategoriesFilter) => {
  return await db.category.findMany({
    ...(categories && categories.length > 0
      ? {
          where: {
            OR: categories.map((c) => ({
              name: { contains: c, mode: 'insensitive' },
            })),
          },
        }
      : {}),
  });
};

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
    include: fieldsToIncludeWithPost,
  });
  const handlerOptions = { uniqueFieldName: 'category' };
  return await handleDBKnownErrors(dbQuery, handlerOptions);
};

export const findPostByIdOrThrow = async (id: string, authorId?: string) => {
  const dbQuery = db.post.findUnique({
    where: { id, ...getPrivatePostProtectionArgs(authorId) },
    include: fieldsToIncludeWithPost,
  });
  const post = await handleDBKnownErrors(dbQuery);
  if (!post) throw new AppNotFoundError('Post Not Found');
  return post;
};

export const findFilteredPosts = async (
  filters: PostFilters = {},
  operation: 'count' | 'findMany' = 'findMany'
) => {
  const { currentUserId, categories, authorId, text } = filters;
  const where: Prisma.PostWhereInput = {
    ...getPrivatePostProtectionArgs(currentUserId),
    AND: {
      ...(authorId ? { authorId } : {}),
      ...{
        OR: text
          ? [
              { title: { contains: text, mode: 'insensitive' } },
              { content: { contains: text, mode: 'insensitive' } },
            ]
          : [],
      },
      ...(categories
        ? {
            categories: {
              some: {
                categoryName: { in: categories, mode: 'insensitive' },
              },
            },
          }
        : {}),
    },
  };
  return operation === 'count'
    ? await handleDBKnownErrors(db.post.count({ where }))
    : await handleDBKnownErrors(
        db.post.findMany({
          include: fieldsToIncludeWithPost,
          ...getPaginationArgs(filters),
          where,
        })
      );
};

export const findFilteredComments = async (
  filters: CommentFilters = {},
  operation: 'findMany' | 'count' = 'findMany'
) => {
  const { currentUserId, authorId, postId, text } = filters;
  const where: Prisma.CommentWhereInput = {
    ...getAggregatePrivatePostProtectionArgs(currentUserId),
    ...(text ? { content: { contains: text, mode: 'insensitive' } } : {}),
    ...(authorId ? { authorId } : {}),
    ...(postId ? { postId } : {}),
  };
  return operation === 'count'
    ? await handleDBKnownErrors(db.comment.count({ where }))
    : await handleDBKnownErrors(
        db.comment.findMany({
          include: fieldsToIncludeWithComment,
          ...getPaginationArgs(filters),
          where,
        })
      );
};

export const findFilteredVotes = async (
  filters: VoteFilters = {},
  operation: 'findMany' | 'count' = 'findMany'
) => {
  const { currentUserId, authorId, isUpvote, postId } = filters;
  const where: Prisma.VoteOnPostWhereInput = {
    ...getAggregatePrivatePostProtectionArgs(currentUserId),
    ...(typeof isUpvote === 'boolean' ? { isUpvote } : {}),
    ...(authorId ? { userId: authorId } : {}),
    ...(postId ? { postId } : {}),
  };
  return operation === 'count'
    ? await handleDBKnownErrors(db.voteOnPost.count({ where }))
    : await handleDBKnownErrors(
        db.voteOnPost.findMany({
          include: fieldsToIncludeWithVote,
          ...getPaginationArgs(filters),
          where,
        })
      );
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
          include: fieldsToIncludeWithPost,
        }),
      ])
    )[1])();
  const handlerOptions = {
    notFoundErrMsg: 'Post not found',
    uniqueFieldName: 'category',
  };
  return await handleDBKnownErrors(dbQuery, handlerOptions);
};

export const upvotePost = async (postId: string, userId: string) => {
  const dbQuery = db.post.update({
    where: { id: postId, ...getPrivatePostProtectionArgs(userId) },
    data: {
      votes: {
        connectOrCreate: {
          where: { userId_postId: { postId, userId } },
          create: { userId },
        },
      },
    },
    include: fieldsToIncludeWithPost,
  });
  const handlerOptions = {
    notFoundErrMsg: 'Post not found',
    uniqueFieldName: 'user-upvote',
  };
  return await handleDBKnownErrors(dbQuery, handlerOptions);
};

export const downvotePost = async (postId: string, userId: string) => {
  const dbQuery = db.post.update({
    where: { id: postId, ...getPrivatePostProtectionArgs(userId) },
    data: { votes: { delete: { userId_postId: { postId, userId } } } },
    include: fieldsToIncludeWithPost,
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
    where: { id: post.id, ...getPrivatePostProtectionArgs(authorId) },
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
  const id = commentId;
  const dbQuery = db.comment.findUnique({
    where: {
      id,
      postId,
      ...getAggregatePrivatePostProtectionArgs(authorId),
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
    where: { id: postId, ...getPrivatePostProtectionArgs(commentAuthorId) },
    data: { comments: { create: { ...data, authorId: commentAuthorId } } },
    include: fieldsToIncludeWithPost,
  });
  const handlerOptions = { notFoundErrMsg: 'Post/Comment Not Found' };
  return await handleDBKnownErrors(dbQuery, handlerOptions);
};

export const findPostCommentByCompoundIdAndUpdate = async (
  postId: string,
  commentId: string,
  commentAuthorId: string,
  data: NewCommentParsedData
) => {
  const dbQuery = db.post.update({
    where: { id: postId, ...getPrivatePostProtectionArgs(commentAuthorId) },
    data: { comments: { update: { where: { id: commentId }, data } } },
    include: fieldsToIncludeWithPost,
  });
  const handlerOptions = { notFoundErrMsg: 'Post/Comment Not Found' };
  return await handleDBKnownErrors(dbQuery, handlerOptions);
};

export const findPostCommentByCompoundIdAndDelete = async (
  postId: string,
  commentId: string,
  postAuthorId?: string
) => {
  const id = commentId;
  const dbQuery = db.comment.delete({
    where: {
      id,
      postId,
      ...getAggregatePrivatePostProtectionArgs(postAuthorId),
    },
  });
  await handleDBKnownErrors(dbQuery);
};

export const findPostCategories = async (postId: string, authorId?: string) => {
  return handleDBKnownErrors(
    db.categoriesOnPosts.findMany({
      where: { postId, ...getAggregatePrivatePostProtectionArgs(authorId) },
    })
  );
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
  return await handleDBKnownErrors(
    db.categoriesOnPosts.count({
      where: { postId, ...getAggregatePrivatePostProtectionArgs(authorId) },
    })
  );
};

export const countPostComments = async (postId: string, authorId?: string) => {
  return await handleDBKnownErrors(
    db.comment.count({
      where: { postId, ...getAggregatePrivatePostProtectionArgs(authorId) },
    })
  );
};

export const countPostVotes = async (postId: string, authorId?: string) => {
  return await handleDBKnownErrors(
    db.voteOnPost.count({
      where: { postId, ...getAggregatePrivatePostProtectionArgs(authorId) },
    })
  );
};

export const postsService = {
  getAggregatePrivatePostProtectionArgs,
  findPostCommentByCompoundIdAndDelete,
  findPostCommentByCompoundIdAndUpdate,
  countPostsCategoriesByPostsAuthorId,
  findPostCommentByCompoundIdOrThrow,
  findPostByIdAndCreateComment,
  getPrivatePostProtectionArgs,
  findFilteredComments,
  findPostByIdOrThrow,
  countPostCategories,
  findPostCategories,
  findFilteredVotes,
  findFilteredPosts,
  countPostComments,
  countPostVotes,
  getCategories,
  downvotePost,
  createPost,
  updatePost,
  upvotePost,
  deletePost,
};

export default postsService;
