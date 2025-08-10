import * as Exp from 'express';
import * as Types from '@/types';
import * as Config from '@/lib/config';
import * as Storage from '@/lib/storage';
import * as AppError from '@/lib/app-error';
import { Prisma } from '@/../prisma/client';
import { z } from 'zod';
import ms from 'ms';
import db from '@/lib/db';
import jwt from 'jsonwebtoken';

export const createJwtForUser = (user: Types.PublicUser): string => {
  const { id, isAdmin } = user;
  const payload: Types.AppJwtPayload = { id, isAdmin };
  const token = jwt.sign(payload, Config.SECRET, {
    expiresIn: Config.TOKEN_EXP_PERIOD as ms.StringValue,
  });
  return `Bearer ${token}`;
};

export const catchDBKnownError = async <P>(
  dbPromise: Promise<P>
): Promise<[P, null] | [null, Prisma.PrismaClientKnownRequestError]> => {
  try {
    return [await dbPromise, null];
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      return [null, error];
    }
    throw error;
  }
};

export const handleDBKnownErrors = async <T>(
  dbQuery: Promise<T>,
  options?: Types.DBKnownErrorsHandlerOptions
): Promise<T> => {
  const [post, error] = await catchDBKnownError(dbQuery);
  if (error) {
    if (error.code === 'P2023' || error.code === 'P2003') {
      throw new AppError.AppInvalidIdError();
    }
    if (error.code === 'P2025') {
      throw new AppError.AppNotFoundError(options?.notFoundErrMsg);
    }
    if (error.code === 'P2002') {
      const targets = error.meta?.target as string[] | undefined;
      throw new AppError.AppUniqueConstraintViolationError(
        targets?.at(-1) ?? options?.uniqueFieldName ?? 'some fields'
      );
    }
    throw error;
  }
  return post;
};

export const getCurrentUserIdFromReq = (req: Exp.Request) => {
  return (req.user as Types.PublicUser | undefined)?.id;
};

export const getTextFilterFromReqQuery = (req: Exp.Request) => {
  return z.string().nonempty().safeParse(req.query.q).data;
};

export const getVoteTypeFilterFromReqQuery = (req: Exp.Request) => {
  let isUpvote;
  if (req.query.upvote && !req.query.downvote) isUpvote = true;
  if (!req.query.upvote && req.query.downvote) isUpvote = false;
  return isUpvote;
};

export const getAuthorIdFilterFromReqQuery = (req: Exp.Request) => {
  return z.string().uuid().optional().safeParse(req.query.author).data;
};

export const getTagsFilterFromReqQuery = (req: Exp.Request) => {
  /* E.g. `...?tags=x,y,z`, or `...?tags=x&blah=0&tags=y,z` */
  const strTagsSchema = z
    .string()
    .nonempty()
    .transform((tags) => tags.split(','));
  return strTagsSchema
    .or(z.array(strTagsSchema).transform((tags) => tags.flat()))
    .safeParse(req.query.tags).data;
};

export const getPaginationFiltersFromReqQuery = (
  req: Exp.Request
): Types.PaginationFilters => {
  const { cursor, sort, limit } = req.query;
  return {
    sort: z.literal('asc').or(z.literal('desc')).safeParse(sort).data,
    cursor: z.coerce.number().int().min(0).safeParse(cursor).data,
    limit: z.coerce.number().int().min(0).safeParse(limit).data,
  };
};

export const getCommonFiltersFromReqQuery = (
  req: Exp.Request
): Types.PaginationFilters => {
  return {
    currentUserId: getCurrentUserIdFromReq(req),
    authorId: getAuthorIdFilterFromReqQuery(req),
    ...getPaginationFiltersFromReqQuery(req),
  };
};

export const getCommentFiltersFromReqQuery = (
  req: Exp.Request
): Types.CommentFilters => {
  return {
    ...getCommonFiltersFromReqQuery(req),
    text: getTextFilterFromReqQuery(req),
  };
};

export const getVoteFiltersFromReqQuery = (req: Exp.Request) => {
  return {
    ...getCommonFiltersFromReqQuery(req),
    isUpvote: getVoteTypeFilterFromReqQuery(req),
  };
};

export const getPostFiltersFromReqQuery = (
  req: Exp.Request
): Types.PostFilters => {
  // Same as the comments filtration + tags filter
  return {
    ...getCommentFiltersFromReqQuery(req),
    tags: getTagsFilterFromReqQuery(req),
  };
};

export const getPaginationArgs = (
  filters: Types.PaginationFilters = {},
  take = 3
) => {
  return {
    orderBy: { order: filters.sort ?? 'asc' },
    take: filters.limit ?? take,
    ...(filters.cursor
      ? {
          cursor: { order: filters.cursor },
          skip: 1,
        }
      : {}),
  };
};

export const fieldsToIncludeWithImage: Types.ImageDataToAggregate = {
  _count: { select: { posts: true } },
  owner: { omit: { password: true } },
};

export const fieldsToIncludeWithPost = {
  _count: { select: { comments: true, votes: true } },
  votes: { include: { user: true }, ...getPaginationArgs() },
  comments: { include: { author: true }, ...getPaginationArgs() },
  image: { include: fieldsToIncludeWithImage },
  tags: true,
  author: true,
};

export const fieldsToIncludeWithComment = { post: true, author: true };

export const fieldsToIncludeWithVote = { post: true, user: true };

export const PURGE_INTERVAL_MS = 12 * 60 * 60 * 1000;

export const purgeNonAdminData = async (now: number, interval: number) => {
  const createdAt = { lte: new Date(now - interval) };
  const author = { isAdmin: false };
  const images = await db.image.findMany({
    omit: { storageFullPath: false, storageId: false },
    where: { owner: author, createdAt },
  });
  for (const image of images) {
    await db.$transaction(async (transClient) => {
      await Storage.removeImage(image);
      return await transClient.image.delete({ where: { id: image.id } });
    });
  }
  await db.$transaction([
    db.comment.deleteMany({ where: { author, createdAt } }),
    db.votesOnPosts.deleteMany({ where: { post: { author, createdAt } } }),
    db.tagsOnPosts.deleteMany({ where: { post: { author, createdAt } } }),
    db.post.deleteMany({ where: { author, createdAt } }),
    db.user.deleteMany({ where: { ...author, createdAt } }),
  ]);
  const tags = (await db.tagsOnPosts.findMany({})).map((t) => t.name);
  await db.tag.deleteMany({ where: { name: { notIn: tags } } });
};
