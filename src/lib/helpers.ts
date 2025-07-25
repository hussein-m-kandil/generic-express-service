import {
  AppNotFoundError,
  AppInvalidIdError,
  AppUniqueConstraintViolationError,
} from '../lib/app-error';
import {
  PublicUser,
  AppJwtPayload,
  PaginationFilters,
  ImageDataToAggregate,
  VoteFilters,
  PostFilters,
  CommentFilters,
  DBKnownErrorsHandlerOptions,
} from '../types';
import { Request } from 'express';
import { Prisma } from '../../prisma/generated/client';
import { SECRET, TOKEN_EXP_PERIOD } from './config';
import { z } from 'zod';
import ms from 'ms';
import db from './db';
import jwt from 'jsonwebtoken';

export const createJwtForUser = (user: PublicUser): string => {
  const { id, isAdmin } = user;
  const payload: AppJwtPayload = { id, isAdmin };
  const token = jwt.sign(payload, SECRET, {
    expiresIn: TOKEN_EXP_PERIOD as ms.StringValue,
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
  options?: DBKnownErrorsHandlerOptions
): Promise<T> => {
  const [post, error] = await catchDBKnownError(dbQuery);
  if (error) {
    if (error.code === 'P2023' || error.code === 'P2003') {
      throw new AppInvalidIdError();
    }
    if (error.code === 'P2025') {
      throw new AppNotFoundError(options?.notFoundErrMsg);
    }
    if (error.code === 'P2002') {
      const targets = error.meta?.target as string[] | undefined;
      throw new AppUniqueConstraintViolationError(
        targets?.at(-1) ?? options?.uniqueFieldName ?? 'some fields'
      );
    }
    throw error;
  }
  return post;
};

export const getCurrentUserIdFromReq = (req: Request) => {
  return (req.user as PublicUser | undefined)?.id;
};

export const getTextFilterFromReqQuery = (req: Request) => {
  return z.string().nonempty().safeParse(req.query.q).data;
};

export const getVoteTypeFilterFromReqQuery = (req: Request) => {
  let isUpvote;
  if (req.query.upvote && !req.query.downvote) isUpvote = true;
  if (!req.query.upvote && req.query.downvote) isUpvote = false;
  return isUpvote;
};

export const getCategoriesFilterFromReqQuery = (req: Request) => {
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
  req: Request
): PaginationFilters => {
  const { cursor, sort, limit } = req.query;
  return {
    sort: z.literal('asc').or(z.literal('desc')).safeParse(sort).data,
    cursor: z.coerce.number().int().min(0).safeParse(cursor).data,
    limit: z.coerce.number().int().min(0).safeParse(limit).data,
  };
};

export const getCommonFiltersFromReqQuery = (
  req: Request
): PaginationFilters & { authorId?: string } => {
  return {
    authorId: getCurrentUserIdFromReq(req),
    ...getPaginationFiltersFromReqQuery(req),
  };
};

export const getCommentFiltersFromReqQuery = (req: Request): CommentFilters => {
  return {
    ...getCommonFiltersFromReqQuery(req),
    text: getTextFilterFromReqQuery(req),
  };
};

export const getVoteFiltersFromReqQuery = (req: Request) => {
  return {
    ...getCommonFiltersFromReqQuery(req),
    isUpvote: getVoteTypeFilterFromReqQuery(req),
  };
};

export const getPostFiltersFromReqQuery = (req: Request): PostFilters => {
  // Same as the comments filtration + categories filter
  return {
    ...getCommentFiltersFromReqQuery(req),
    categories: getCategoriesFilterFromReqQuery(req),
  };
};

export const getPaginationArgs = (filters: PaginationFilters, take = 3) => {
  return {
    orderBy: { order: filters.sort ?? 'desc' },
    take: filters.limit ?? take,
    ...(filters.cursor
      ? {
          cursor: { order: filters.cursor },
          skip: 1,
        }
      : {}),
  };
};

export const fieldsToIncludeWithImage: ImageDataToAggregate = {
  owner: { omit: { password: true } },
};

export const fieldsToIncludeWithPost = {
  image: { include: fieldsToIncludeWithImage },
  comments: { include: { author: true }, ...getPaginationArgs({}) },
  votes: { include: { user: true }, ...getPaginationArgs({}) },
  categories: true,
  author: true,
};

export const fieldsToIncludeWithComment = { post: true, author: true };

export const fieldsToIncludeWithVote = { post: true, user: true };

export const findFilteredPosts = async (
  filters?: PostFilters,
  extraWhereClause?: object
) => {
  const baseWhereClause = filters?.authorId
    ? { OR: [{ published: true }, { authorId: filters.authorId }] }
    : { published: true };
  const dbQuery = db.post.findMany({
    where: {
      ...extraWhereClause,
      ...baseWhereClause,
      AND: {
        OR: [
          {
            OR: filters?.text
              ? [
                  { title: { contains: filters.text, mode: 'insensitive' } },
                  { content: { contains: filters.text, mode: 'insensitive' } },
                ]
              : [],
          },
          filters?.categories
            ? {
                categories: {
                  some: {
                    categoryName: {
                      in: filters.categories,
                      mode: 'insensitive',
                    },
                  },
                },
              }
            : {},
        ],
      },
    },
    include: fieldsToIncludeWithPost,
    ...(filters ? getPaginationArgs(filters) : {}),
  });
  return await handleDBKnownErrors(dbQuery);
};

export const findFilteredComments = async (
  filters?: CommentFilters,
  extraWhereClause = {}
) => {
  const authorId = filters?.authorId;
  const dbQuery = db.comment.findMany({
    where: {
      ...extraWhereClause,
      ...(authorId
        ? { OR: [{ post: { authorId } }, { post: { published: true } }] }
        : { post: { published: true } }),
      ...(filters?.text
        ? { content: { contains: filters.text, mode: 'insensitive' } }
        : {}),
    },
    include: fieldsToIncludeWithComment,
    ...(filters ? getPaginationArgs(filters) : {}),
  });
  const comments = await handleDBKnownErrors(dbQuery);
  return comments;
};

export const findFilteredVotes = async (
  filters?: VoteFilters,
  extraWhereClause = {}
) => {
  const authorId = filters?.authorId;
  const isUpvote = filters?.isUpvote;
  const dbQuery = db.voteOnPost.findMany({
    where: {
      ...extraWhereClause,
      ...(authorId
        ? { OR: [{ post: { authorId } }, { post: { published: true } }] }
        : { post: { published: true } }),
      ...(typeof isUpvote === 'boolean' ? { isUpvote } : {}),
    },
    include: fieldsToIncludeWithVote,
    ...(filters ? getPaginationArgs(filters) : {}),
  });
  const comments = await handleDBKnownErrors(dbQuery);
  return comments;
};

export default {
  createJwtForUser,
  catchDBKnownError,
  findFilteredVotes,
  findFilteredPosts,
  getPaginationArgs,
  handleDBKnownErrors,
  findFilteredComments,
  getCurrentUserIdFromReq,
  fieldsToIncludeWithPost,
  fieldsToIncludeWithVote,
  fieldsToIncludeWithImage,
  getTextFilterFromReqQuery,
  getPostFiltersFromReqQuery,
  getVoteFiltersFromReqQuery,
  fieldsToIncludeWithComment,
  getCommonFiltersFromReqQuery,
  getVoteTypeFilterFromReqQuery,
  getCommentFiltersFromReqQuery,
  getCategoriesFilterFromReqQuery,
  getPaginationFiltersFromReqQuery,
};
