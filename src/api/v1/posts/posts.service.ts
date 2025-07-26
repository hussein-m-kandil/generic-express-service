import * as Types from '@/types';
import * as Utils from '@/lib/utils';
import * as AppError from '@/lib/app-error';
import { Prisma } from '@/../prisma/client';
import db from '@/lib/db';

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

export const getCategories = async (categories?: Types.CategoriesFilter) => {
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

export const createPost = async (data: Types.NewPostAuthorizedData) => {
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
    include: Utils.fieldsToIncludeWithPost,
  });
  const handlerOptions = { uniqueFieldName: 'category' };
  return await Utils.handleDBKnownErrors(dbQuery, handlerOptions);
};

export const findPostByIdOrThrow = async (id: string, authorId?: string) => {
  const dbQuery = db.post.findUnique({
    where: { id, ...getPrivatePostProtectionArgs(authorId) },
    include: Utils.fieldsToIncludeWithPost,
  });
  const post = await Utils.handleDBKnownErrors(dbQuery);
  if (!post) throw new AppError.AppNotFoundError('Post Not Found');
  return post;
};

export const findFilteredPosts = async (
  filters: Types.PostFilters = {},
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
    ? await Utils.handleDBKnownErrors(db.post.count({ where }))
    : await Utils.handleDBKnownErrors(
        db.post.findMany({
          include: Utils.fieldsToIncludeWithPost,
          ...Utils.getPaginationArgs(filters),
          where,
        })
      );
};

export const findFilteredComments = async (
  filters: Types.CommentFilters = {},
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
    ? await Utils.handleDBKnownErrors(db.comment.count({ where }))
    : await Utils.handleDBKnownErrors(
        db.comment.findMany({
          include: Utils.fieldsToIncludeWithComment,
          ...Utils.getPaginationArgs(filters),
          where,
        })
      );
};

export const findFilteredVotes = async (
  filters: Types.VoteFilters = {},
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
    ? await Utils.handleDBKnownErrors(db.voteOnPost.count({ where }))
    : await Utils.handleDBKnownErrors(
        db.voteOnPost.findMany({
          include: Utils.fieldsToIncludeWithVote,
          ...Utils.getPaginationArgs(filters),
          where,
        })
      );
};

export const updatePost = async (id: string, data: Types.NewPostParsedData) => {
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
          include: Utils.fieldsToIncludeWithPost,
        }),
      ])
    )[1])();
  const handlerOptions = {
    notFoundErrMsg: 'Post not found',
    uniqueFieldName: 'category',
  };
  return await Utils.handleDBKnownErrors(dbQuery, handlerOptions);
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
    include: Utils.fieldsToIncludeWithPost,
  });
  const handlerOptions = {
    notFoundErrMsg: 'Post not found',
    uniqueFieldName: 'user-upvote',
  };
  return await Utils.handleDBKnownErrors(dbQuery, handlerOptions);
};

export const downvotePost = async (postId: string, userId: string) => {
  const dbQuery = db.post.update({
    where: { id: postId, ...getPrivatePostProtectionArgs(userId) },
    data: { votes: { delete: { userId_postId: { postId, userId } } } },
    include: Utils.fieldsToIncludeWithPost,
  });
  const handlerOptions = {
    notFoundErrMsg: 'Post not found',
    uniqueFieldName: 'user-upvote',
  };
  try {
    const post = await Utils.handleDBKnownErrors(dbQuery, handlerOptions);
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

export const deletePost = async (
  post: Types.PostFullData,
  authorId?: string
) => {
  const delPostQ = db.post.delete({
    where: { id: post.id, ...getPrivatePostProtectionArgs(authorId) },
  });
  // Delete the post with its image if both owned by the same user
  if (post.authorId === post.image?.ownerId) {
    const sameImagePosts = await Utils.handleDBKnownErrors(
      db.post.findMany({ where: { imageId: post.image.id } })
    );
    // Delete the post with its image if there are no other posts using it
    if (sameImagePosts.length === 1 && sameImagePosts[0].id === post.id) {
      const delImgQ = db.image.delete({ where: { id: post.image.id } });
      return await Utils.handleDBKnownErrors(
        db.$transaction([delPostQ, delImgQ])
      );
    }
  }
  // Otherwise, only delete the post and leave its image alone ;)
  return await Utils.handleDBKnownErrors(delPostQ);
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
    include: Utils.fieldsToIncludeWithComment,
  });
  const comment = await Utils.handleDBKnownErrors(dbQuery);
  if (!comment) throw new AppError.AppNotFoundError('Post/Comment Not Found');
  return comment;
};

export const findPostByIdAndCreateComment = async (
  postId: string,
  commentAuthorId: string,
  data: Types.NewCommentParsedData
) => {
  const dbQuery = db.post.update({
    where: { id: postId, ...getPrivatePostProtectionArgs(commentAuthorId) },
    data: { comments: { create: { ...data, authorId: commentAuthorId } } },
    include: Utils.fieldsToIncludeWithPost,
  });
  const handlerOptions = { notFoundErrMsg: 'Post/Comment Not Found' };
  return await Utils.handleDBKnownErrors(dbQuery, handlerOptions);
};

export const findPostCommentByCompoundIdAndUpdate = async (
  postId: string,
  commentId: string,
  commentAuthorId: string,
  data: Types.NewCommentParsedData
) => {
  const dbQuery = db.post.update({
    where: { id: postId, ...getPrivatePostProtectionArgs(commentAuthorId) },
    data: { comments: { update: { where: { id: commentId }, data } } },
    include: Utils.fieldsToIncludeWithPost,
  });
  const handlerOptions = { notFoundErrMsg: 'Post/Comment Not Found' };
  return await Utils.handleDBKnownErrors(dbQuery, handlerOptions);
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
  await Utils.handleDBKnownErrors(dbQuery);
};

export const findPostCategories = async (postId: string, authorId?: string) => {
  return Utils.handleDBKnownErrors(
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
  const postDistinctCategories = await Utils.handleDBKnownErrors(dbQuery);
  return postDistinctCategories.length;
};

export const countPostCategories = async (
  postId: string,
  authorId?: string
) => {
  return await Utils.handleDBKnownErrors(
    db.categoriesOnPosts.count({
      where: { postId, ...getAggregatePrivatePostProtectionArgs(authorId) },
    })
  );
};

export const countPostComments = async (postId: string, authorId?: string) => {
  return await Utils.handleDBKnownErrors(
    db.comment.count({
      where: { postId, ...getAggregatePrivatePostProtectionArgs(authorId) },
    })
  );
};

export const countPostVotes = async (postId: string, authorId?: string) => {
  return await Utils.handleDBKnownErrors(
    db.voteOnPost.count({
      where: { postId, ...getAggregatePrivatePostProtectionArgs(authorId) },
    })
  );
};
