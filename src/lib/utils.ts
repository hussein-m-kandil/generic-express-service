import * as Exp from 'express';
import * as Types from '@/types';
import * as JWT from 'jsonwebtoken';
import * as Config from '@/lib/config';
import * as AppError from '@/lib/app-error';
import { Prisma } from '@/../prisma/client';
import { z } from 'zod';
import ms from 'ms';

export const createJwtForUser = (user: Types.PublicUser): string => {
  const { id, isAdmin } = user;
  const payload: Types.AppJwtPayload = { id, isAdmin };
  const token = JWT.sign(payload, Config.SECRET, {
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

export const getCategoriesFilterFromReqQuery = (req: Exp.Request) => {
  /* E.g. `...?categories=x,y,z`, or `...?categories=x&blah=0&categories=y,z` */
  const strCatsSchema = z
    .string()
    .nonempty()
    .transform((cats) => cats.split(','));
  return strCatsSchema
    .or(z.array(strCatsSchema).transform((cats) => cats.flat()))
    .safeParse(req.query.categories).data;
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
  // Same as the comments filtration + categories filter
  return {
    ...getCommentFiltersFromReqQuery(req),
    categories: getCategoriesFilterFromReqQuery(req),
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
  owner: { omit: { password: true } },
};

export const fieldsToIncludeWithPost = {
  _count: { select: { comments: true, votes: true } },
  votes: { include: { user: true }, ...getPaginationArgs() },
  comments: { include: { author: true }, ...getPaginationArgs() },
  image: { include: fieldsToIncludeWithImage },
  categories: true,
  author: true,
};

export const fieldsToIncludeWithComment = { post: true, author: true };

export const fieldsToIncludeWithVote = { post: true, user: true };
