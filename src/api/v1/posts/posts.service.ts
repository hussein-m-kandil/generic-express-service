import * as Types from '@/types';
import * as Utils from '@/lib/utils';
import * as Image from '@/lib/image';
import * as Storage from '@/lib/storage';
import * as AppError from '@/lib/app-error';
import { Prisma, User } from '@/../prisma/client';
import logger from '@/lib/logger';
import db from '@/lib/db';

export const preparePosts = async <
  T extends Types.BasePostFullData & { _count: Types.BasePostCounts },
>(
  posts: T[],
  currentUserId?: User['id'],
): Promise<(T & Types.PostFullData)[]> => {
  const preparedPosts: (T & Types.PostFullData)[] = [];
  for (const post of posts) {
    const postId = post.id;
    const userId = currentUserId;
    const [upvotedByCurrentUser, downvotedByCurrentUser] = userId
      ? (
          await Utils.handleDBKnownErrors(
            db.$transaction([
              db.votesOnPosts.findUnique({
                where: { userId_postId: { userId, postId }, isUpvote: true },
              }),
              db.votesOnPosts.findUnique({
                where: { userId_postId: { userId, postId }, isUpvote: false },
              }),
            ]),
          )
        ).map((foundVote) => !!foundVote)
      : [false, false];
    const [upvotes, downvotes] = await Utils.handleDBKnownErrors(
      db.$transaction([
        db.votesOnPosts.count({ where: { postId, isUpvote: true } }),
        db.votesOnPosts.count({ where: { postId, isUpvote: false } }),
      ]),
    );
    const _count = { ...post._count, upvotes, downvotes };
    preparedPosts.push({ ...post, _count, upvotedByCurrentUser, downvotedByCurrentUser });
  }
  return preparedPosts;
};

export const getPrivatePostProtectionArgs = (authorId?: string) => {
  return authorId ? { OR: [{ published: true }, { authorId }] } : { published: true };
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

export const getPostUpdateData = (data: Types.NewPostParsedData, imageId?: string) => {
  return {
    imageId,
    title: data.title,
    content: data.content,
    published: data.published,
    tags: {
      create: data.tags.map((name) => ({
        tag: { connectOrCreate: { where: { name }, create: { name } } },
      })),
    },
  };
};

export const getPostCreateData = (
  data: Types.NewPostParsedData,
  authorId: string,
  imageId?: string,
) => {
  return { ...getPostUpdateData(data, imageId), authorId };
};

const wrapPostCreate = async <T>(dbQuery: Promise<T>): Promise<T> => {
  const handlerOptions = { uniqueFieldName: 'tag' };
  return await Utils.handleDBKnownErrors(dbQuery, handlerOptions);
};

export const createPost = async (
  postData: Types.NewPostParsedDataWithoutImage,
  user: Types.PublicUser,
) => {
  const createdPost = await wrapPostCreate(
    db.post.create({
      data: getPostCreateData(postData, user.id),
      include: Utils.fieldsToIncludeWithPost,
    }),
  );
  return (await preparePosts([createdPost], user.id))[0];
};

export const createPostWithImage = async (
  postData: Types.NewPostParsedDataWithoutImage,
  user: Types.PublicUser,
  imageData: Types.ImageFullData,
  uploadedImage: Storage.UploadedImageData,
) => {
  const createdPost = await wrapPostCreate(
    db.$transaction(async (prismaClient) => {
      const image = await prismaClient.image.create({
        data: Image.getImageUpsertData(uploadedImage, imageData, user),
      });
      return await prismaClient.post.create({
        data: getPostCreateData(postData, user.id, image.id),
        include: Utils.fieldsToIncludeWithPost,
      });
    }),
  );
  return (await preparePosts([createdPost], user.id))[0];
};

export const findPostByIdOrThrow = async (id: string, authorId?: string) => {
  const dbQuery = db.post.findUnique({
    where: { id, ...getPrivatePostProtectionArgs(authorId) },
    include: Utils.fieldsToIncludeWithPost,
  });
  const post = await Utils.handleDBKnownErrors(dbQuery);
  if (!post) throw new AppError.AppNotFoundError('Post Not Found');
  return (await preparePosts([post]))[0];
};

export const _findPostWithAggregationOrThrow = async (id: string, authorId?: string) => {
  const dbQuery = db.post.findUnique({
    where: { id, ...getPrivatePostProtectionArgs(authorId) },
    include: {
      ...Utils.fieldsToIncludeWithPost,
      image: {
        ...Utils.fieldsToIncludeWithPost.image,
        omit: { storageFullPath: false, storageId: false },
      },
    },
  });
  const post = await Utils.handleDBKnownErrors(dbQuery);
  if (!post) throw new AppError.AppNotFoundError('Post Not Found');
  return (await preparePosts([post]))[0];
};

export type _PostFullData = Awaited<ReturnType<typeof _findPostWithAggregationOrThrow>>;

export const findFilteredPosts = async (
  filters: Types.PostFilters = { following: false },
  operation: 'count' | 'findMany' = 'findMany',
) => {
  const { currentUserId: userId, following, authorId, tags, text } = filters;
  const where: Prisma.PostWhereInput = {
    ...getPrivatePostProtectionArgs(userId),
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
      ...(userId && following
        ? { author: { profile: { followers: { some: { follower: { userId } } } } } }
        : {}),
    },
  };
  filters.sort = filters.sort ?? 'desc';
  if (operation === 'count') {
    return await Utils.handleDBKnownErrors(db.post.count({ where }));
  } else {
    const posts = await Utils.handleDBKnownErrors(
      db.post.findMany({
        include: Utils.fieldsToIncludeWithPost,
        ...Utils.getPaginationArgs(filters),
        where,
      }),
    );
    return await preparePosts(posts, userId);
  }
};

export const findFilteredComments = async (
  filters: Types.CommentFilters = {},
  operation: 'findMany' | 'count' = 'findMany',
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
        }),
      );
};

export const findFilteredVotes = async (
  filters: Types.VoteFilters = {},
  operation: 'findMany' | 'count' = 'findMany',
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
        }),
      );
};

const wrapPostUpdate = async <T>(dbQuery: Promise<T>): Promise<T> => {
  const handlerOptions = {
    notFoundErrMsg: 'Post not found',
    uniqueFieldName: 'tag',
  };
  return await Utils.handleDBKnownErrors(dbQuery, handlerOptions);
};

export const updatePost = async (
  post: _PostFullData,
  user: Types.PublicUser,
  postData: Types.NewPostParsedData,
  imageData?: Types.ImageDataInput,
) => {
  const updatedPost = await wrapPostUpdate(
    db.$transaction(async (prismaClient) => {
      if (imageData && post.image) {
        await prismaClient.image.update({
          where: { id: post.image.id },
          data: imageData,
        });
      }
      await prismaClient.tagsOnPosts.deleteMany({ where: { postId: post.id } });
      return await prismaClient.post.update({
        where: { id: post.id },
        data: getPostUpdateData(postData),
        include: Utils.fieldsToIncludeWithPost,
      });
    }),
  );
  return (await preparePosts([updatedPost], user.id))[0];
};

export const updatePostWithImage = async (
  post: _PostFullData,
  user: Types.PublicUser,
  postData: Types.NewPostParsedData,
  imageData: Types.ImageFullData,
  uploadedImage: Storage.UploadedImageData,
) => {
  const updatedPost = await wrapPostUpdate(
    db.$transaction(async (prismaClient) => {
      const imgUpData = Image.getImageUpsertData(uploadedImage, imageData, user);
      const { id: imageId } = await db.image.upsert({
        where: { src: imgUpData.src },
        create: imgUpData,
        update: imgUpData,
      });
      await prismaClient.tagsOnPosts.deleteMany({ where: { postId: post.id } });
      return await prismaClient.post.update({
        where: { id: post.id },
        include: Utils.fieldsToIncludeWithPost,
        data: getPostUpdateData(postData, imageId),
      });
    }),
  );
  return (await preparePosts([updatedPost], user.id))[0];
};

const upvoteOrDownvotePost = async (
  action: 'upvote' | 'downvote',
  postId: string,
  userId: string,
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
  const votedPost = await Utils.handleDBKnownErrors(dbQuery, handlerOptions);
  return (await preparePosts([votedPost], userId))[0];
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
    const unvotedPost = await Utils.handleDBKnownErrors(dbQuery, handlerOptions);
    return (await preparePosts([unvotedPost], userId))[0];
  } catch (error) {
    const connectionDoesNotExist =
      error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2017';
    if (connectionDoesNotExist) return findPostByIdOrThrow(postId);
    throw error;
  }
};

export const deletePost = async (post: Types.PostFullData, authorId?: string) => {
  const delPostQ = db.post.delete({
    where: { id: post.id, ...getPrivatePostProtectionArgs(authorId) },
  });
  if (post.imageId) {
    // Get the post image with the count of posts connected to it, if its owner is the post author
    let postImage;
    try {
      postImage = await db.image.findUnique({
        include: Image.FIELDS_TO_INCLUDE,
        omit: { storageFullPath: false, storageId: false },
        where: { id: post.imageId, ownerId: post.authorId },
      });
    } catch (error) {
      logger.error('Expect to found post image -', error);
    }
    // If the image is connected to this post only, delete it with the post in a single transaction
    if (postImage && postImage._count.posts === 1) {
      try {
        await Storage.removeImage(postImage);
        return await Utils.handleDBKnownErrors(
          db.$transaction([delPostQ, db.image.delete({ where: { id: postImage.id } })]),
        );
      } catch (error) {
        logger.error('Failed to remove an image form the storage -', error);
      }
    }
  }
  // Otherwise, only delete the post and leave its image alone ;)
  return await Utils.handleDBKnownErrors(delPostQ);
};

export const findPostCommentByCompoundIdOrThrow = async (
  postId: string,
  commentId: string,
  authorId?: string,
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
  data: Types.NewCommentParsedData,
) => {
  await findPostByIdOrThrow(postId, commentAuthorId);
  return await Utils.handleDBKnownErrors(
    db.comment.create({
      data: { ...data, postId, authorId: commentAuthorId },
      include: Utils.fieldsToIncludeWithComment,
    }),
  );
};

export const findCommentAndUpdate = async (
  commentId: string,
  commentAuthorId: string,
  data: Types.NewCommentParsedData,
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

export const findCommentAndDelete = async (commentId: string, postAuthorId?: string) => {
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
    }),
  );
};

export const countTagsOnPosts = async (postAuthorId?: string) => {
  return await Utils.handleDBKnownErrors(
    db.tag.count(
      postAuthorId
        ? { where: { posts: { some: { post: { authorId: postAuthorId } } } } }
        : undefined,
    ),
  );
};

export const countPostTags = async (postId: string, authorId?: string) => {
  return await Utils.handleDBKnownErrors(
    db.tagsOnPosts.count({
      where: { postId, ...getAggregatePrivatePostProtectionArgs(authorId) },
    }),
  );
};

export const countPostComments = async (postId: string, authorId?: string) => {
  return await Utils.handleDBKnownErrors(
    db.comment.count({
      where: { postId, ...getAggregatePrivatePostProtectionArgs(authorId) },
    }),
  );
};

export const countPostVotes = async (postId: string, authorId?: string) => {
  return await Utils.handleDBKnownErrors(
    db.votesOnPosts.count({
      where: { postId, ...getAggregatePrivatePostProtectionArgs(authorId) },
    }),
  );
};
