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

export const getAllCategories = async (categories?: CategoriesFilter) => {
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
    include: fieldsToIncludeWithPost,
  });
  const post = await handleDBKnownErrors(dbQuery);
  if (!post) throw new AppNotFoundError('Post Not Found');
  return post;
};

export const findFilteredPosts = async (
  filters: PostFilters = {},
  extraWhereClause?: object
) => {
  const { currentUserId, categories, authorId, text } = filters;
  const dbQuery = db.post.findMany({
    where: {
      ...extraWhereClause,
      ...(currentUserId
        ? { OR: [{ published: true }, { authorId: filters.currentUserId }] }
        : { published: true }),
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
    },
    include: fieldsToIncludeWithPost,
    ...getPaginationArgs(filters),
  });
  return await handleDBKnownErrors(dbQuery);
};

export const findFilteredComments = async (
  filters: CommentFilters = {},
  extraWhereClause = {}
) => {
  const { currentUserId, authorId, text } = filters;
  const dbQuery = db.comment.findMany({
    where: {
      ...extraWhereClause,
      ...(currentUserId
        ? {
            OR: [
              { post: { published: true } },
              { post: { authorId: currentUserId } },
            ],
          }
        : { post: { published: true } }),
      AND: {
        ...(authorId ? { authorId } : {}),
        ...(text ? { content: { contains: text, mode: 'insensitive' } } : {}),
      },
    },
    include: fieldsToIncludeWithComment,
    ...getPaginationArgs(filters),
  });
  const comments = await handleDBKnownErrors(dbQuery);
  return comments;
};

export const findFilteredVotes = async (
  filters: VoteFilters = {},
  extraWhereClause = {}
) => {
  const { currentUserId, authorId, isUpvote } = filters;
  const dbQuery = db.voteOnPost.findMany({
    where: {
      ...extraWhereClause,
      ...(currentUserId
        ? {
            OR: [
              { post: { authorId: currentUserId } },
              { post: { published: true } },
            ],
          }
        : { post: { published: true } }),
      AND: {
        ...(authorId ? { userId: authorId } : {}),
        ...(typeof isUpvote === 'boolean' ? { isUpvote } : {}),
      },
    },
    include: fieldsToIncludeWithVote,
    ...getPaginationArgs(filters),
  });
  const comments = await handleDBKnownErrors(dbQuery);
  return comments;
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
    include: fieldsToIncludeWithPost,
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
    include: fieldsToIncludeWithPost,
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
    include: fieldsToIncludeWithPost,
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
  return (await findPostByIdOrThrow(postId, authorId)).votes.length;
};

export const postsService = {
  findPostCommentByCompoundIdAndDelete,
  findPostCommentByCompoundIdAndUpdate,
  countPostsCategoriesByPostsAuthorId,
  findPostCommentByCompoundIdOrThrow,
  countPostsCommentsByPostsAuthorId,
  countPostsVotesByPostsAuthorId,
  findPostByIdAndCreateComment,
  findFilteredComments,
  countPostsByAuthorId,
  findPostByIdOrThrow,
  countPostCategories,
  findPostCategories,
  findFilteredVotes,
  findFilteredPosts,
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
