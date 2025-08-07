import * as Types from '@/types';
import * as Utils from '@/lib/utils';
import * as AppError from '@/lib/app-error';
import { Prisma } from '@/../prisma/client';
import db from '@/lib/db';
import logger from '@/lib/logger';

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

export const getTags = async (tags?: Types.TagsFilter) => {
  return await db.tag.findMany({
    ...(tags && tags.length > 0
      ? {
          where: {
            OR: tags.map((c) => ({
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
      tags: {
        create: data.tags.map((name) => ({
          tag: {
            connectOrCreate: { where: { name }, create: { name } },
          },
        })),
      },
    },
    include: Utils.fieldsToIncludeWithPost,
  });
  const handlerOptions = { uniqueFieldName: 'tag' };
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
  const { currentUserId, authorId, tags, text } = filters;
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
      ...(tags
        ? {
            tags: { some: { name: { in: tags, mode: 'insensitive' } } },
          }
        : {}),
    },
  };
  filters.sort = filters.sort ?? 'desc';
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
  const where: Prisma.VotesOnPostsWhereInput = {
    ...getAggregatePrivatePostProtectionArgs(currentUserId),
    ...(typeof isUpvote === 'boolean' ? { isUpvote } : {}),
    ...(authorId ? { userId: authorId } : {}),
    ...(postId ? { postId } : {}),
  };
  return operation === 'count'
    ? await Utils.handleDBKnownErrors(db.votesOnPosts.count({ where }))
    : await Utils.handleDBKnownErrors(
        db.votesOnPosts.findMany({
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
        db.tagsOnPosts.deleteMany({ where: { postId: id } }),
        db.post.update({
          where: { id },
          data: {
            title: data.title,
            imageId: data.image,
            content: data.content,
            published: data.published,
            tags: {
              create: data.tags.map((name) => ({
                tag: { connectOrCreate: { where: { name }, create: { name } } },
              })),
            },
          },
          include: Utils.fieldsToIncludeWithPost,
        }),
      ])
    )[1])();
  const handlerOptions = {
    notFoundErrMsg: 'Post not found',
    uniqueFieldName: 'tag',
  };
  return await Utils.handleDBKnownErrors(dbQuery, handlerOptions);
};

const upvoteOrDownvotePost = async (
  action: 'upvote' | 'downvote',
  postId: string,
  userId: string
) => {
  const isUpvote = action === 'upvote';
  const dbQuery = db.post.update({
    where: { id: postId, ...getPrivatePostProtectionArgs(userId) },
    data: {
      votes: {
        upsert: {
          where: { userId_postId: { postId, userId } },
          create: { isUpvote, userId },
          update: { isUpvote, userId },
        },
      },
    },
    include: Utils.fieldsToIncludeWithPost,
  });
  const handlerOptions = {
    notFoundErrMsg: 'Post not found',
    uniqueFieldName: 'user_post_vote',
  };
  return await Utils.handleDBKnownErrors(dbQuery, handlerOptions);
};

export const upvotePost = (postId: string, userId: string) => {
  return upvoteOrDownvotePost('upvote', postId, userId);
};

export const downvotePost = (postId: string, userId: string) => {
  return upvoteOrDownvotePost('downvote', postId, userId);
};

export const unvotePost = async (postId: string, userId: string) => {
  const dbQuery = db.post.update({
    where: { id: postId, ...getPrivatePostProtectionArgs(userId) },
    data: { votes: { delete: { userId_postId: { postId, userId } } } },
    include: Utils.fieldsToIncludeWithPost,
  });
  const handlerOptions = {
    notFoundErrMsg: 'Post not found',
    uniqueFieldName: 'user_post_vote',
  };
  try {
    return await Utils.handleDBKnownErrors(dbQuery, handlerOptions);
  } catch (error) {
    const connectionDoesNotExist =
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2017';
    if (connectionDoesNotExist) return findPostByIdOrThrow(postId);
    throw error;
  }
};

export const deletePost = async (
  post: Types.PostFullData,
  authorId?: string
) => {
  const delPostQ = db.post.delete({
    where: { id: post.id, ...getPrivatePostProtectionArgs(authorId) },
  });
  if (post.imageId) {
    // Get the post image with the count of posts connected to it, if its owner is the post author
    let postImage;
    try {
      postImage = await db.image.findUnique({
        where: { id: post.imageId, ownerId: post.authorId },
        include: { _count: { select: { posts: true } } },
      });
    } catch (error) {
      logger.error('Expect to found post image -', error);
    }
    // If the image is connected to this post only, delete it with the post in a single transaction
    if (postImage && postImage._count.posts === 1) {
      const delImgQ = db.image.delete({ where: { id: postImage.id } });
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
  await findPostByIdOrThrow(postId, commentAuthorId);
  return await Utils.handleDBKnownErrors(
    db.comment.create({
      data: { ...data, postId, authorId: commentAuthorId },
      include: Utils.fieldsToIncludeWithComment,
    })
  );
};

export const findCommentAndUpdate = async (
  commentId: string,
  commentAuthorId: string,
  data: Types.NewCommentParsedData
) => {
  const dbQuery = db.comment.update({
    where: {
      id: commentId,
      ...getAggregatePrivatePostProtectionArgs(commentAuthorId),
    },
    include: Utils.fieldsToIncludeWithComment,
    data,
  });
  const handlerOptions = { notFoundErrMsg: 'Post/Comment Not Found' };
  return await Utils.handleDBKnownErrors(dbQuery, handlerOptions);
};

export const findCommentAndDelete = async (
  commentId: string,
  postAuthorId?: string
) => {
  const dbQuery = db.comment.delete({
    where: {
      id: commentId,
      ...getAggregatePrivatePostProtectionArgs(postAuthorId),
    },
  });
  await Utils.handleDBKnownErrors(dbQuery);
};

export const findPostTags = async (postId: string, authorId?: string) => {
  return Utils.handleDBKnownErrors(
    db.tagsOnPosts.findMany({
      where: { postId, ...getAggregatePrivatePostProtectionArgs(authorId) },
    })
  );
};

export const countPostsTagsByPostsAuthorId = async (authorId: string) => {
  const dbQuery = db.tagsOnPosts.findMany({
    where: { post: { authorId } },
    distinct: ['name'],
  });
  const postDistinctTags = await Utils.handleDBKnownErrors(dbQuery);
  return postDistinctTags.length;
};

export const countPostTags = async (postId: string, authorId?: string) => {
  return await Utils.handleDBKnownErrors(
    db.tagsOnPosts.count({
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
    db.votesOnPosts.count({
      where: { postId, ...getAggregatePrivatePostProtectionArgs(authorId) },
    })
  );
};
