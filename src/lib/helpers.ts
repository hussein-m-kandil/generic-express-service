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
  VoteFiltrationOptions,
  PostFiltrationOptions,
  CommentFiltrationOptions,
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

export const fieldsToIncludeWithImage: ImageDataToAggregate = {
  owner: { omit: { password: true } },
};

export const fieldsToIncludeWithPost = {
  image: { include: fieldsToIncludeWithImage },
  comments: { include: { author: true } },
  votes: { include: { user: true } },
  categories: true,
  author: true,
};

export const fieldsToIncludeWithComment = { post: true, author: true };

export const fieldsToIncludeWithVote = { post: true, user: true };

export const getTextFilterFromReqQuery = (req: Request) => {
  let text;
  if (typeof req.query.q === 'string') {
    text = req.query.q;
  }
  return text;
};

export const getPaginationFiltersFromReq = (
  req: Request
): PaginationFilters => {
  const { cursor, sort, limit } = req.query;
  return {
    sort: z.literal('asc').or(z.literal('desc')).safeParse(sort).data,
    cursor: z.coerce.number().int().min(0).safeParse(cursor).data,
    limit: z.coerce.number().int().min(0).safeParse(limit).data,
  };
};

export const getVoteTypeFilterFromReqQuery = (req: Request) => {
  let isUpvote;
  if (req.query.upvote && !req.query.downvote) isUpvote = true;
  if (!req.query.upvote && req.query.downvote) isUpvote = false;
  return isUpvote;
};

export const getSignedInUserIdFromReqQuery = (req: Request) => {
  let userId;
  if (req.user) {
    userId = (req.user as PublicUser).id;
  }
  return userId;
};

export const getCategoriesFilterFromReqQuery = (req: Request) => {
  let categories;
  if (typeof req.query.categories === 'string') {
    categories = req.query.categories.split(',');
  } else if (
    Array.isArray(req.query.categories) &&
    req.query.categories.every((c) => typeof c === 'string')
  ) {
    categories = req.query.categories.flatMap((item) => item.split(','));
  }
  return categories;
};

export const getCommentFilterOptionsFromReqQuery = (
  req: Request
): CommentFiltrationOptions => {
  return {
    authorId: getSignedInUserIdFromReqQuery(req),
    text: getTextFilterFromReqQuery(req),
    ...getPaginationFiltersFromReq(req),
  };
};

export const getVoteFilterOptionsFromReqQuery = (req: Request) => {
  return {
    authorId: getSignedInUserIdFromReqQuery(req),
    isUpvote: getVoteTypeFilterFromReqQuery(req),
  };
};

export const getPostFilterOptionsFromReqQuery = (
  req: Request
): PostFiltrationOptions => {
  return {
    categories: getCategoriesFilterFromReqQuery(req),
    authorId: getSignedInUserIdFromReqQuery(req),
    text: getTextFilterFromReqQuery(req),
    ...getPaginationFiltersFromReq(req),
  };
};

export const getPaginationArgs = (options: PaginationFilters, take = 3) => {
  return {
    orderBy: { order: options.sort ?? 'asc' },
    take: options.limit ?? take,
    ...(options.cursor
      ? {
          cursor: { order: options.cursor },
          skip: options.cursor > 1 ? 1 : 0,
        }
      : {}),
  };
};

export const findFilteredPosts = async (
  options?: PostFiltrationOptions,
  extraWhereClause?: object
) => {
  const baseWhereClause = options?.authorId
    ? { OR: [{ published: true }, { authorId: options.authorId }] }
    : { published: true };
  const dbQuery = db.post.findMany({
    where: {
      ...extraWhereClause,
      ...baseWhereClause,
      AND: {
        OR: [
          {
            OR: options?.text
              ? [
                  { title: { contains: options.text, mode: 'insensitive' } },
                  { content: { contains: options.text, mode: 'insensitive' } },
                ]
              : [],
          },
          options?.categories
            ? {
                categories: {
                  some: {
                    categoryName: {
                      in: options.categories,
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
    ...(options ? getPaginationArgs(options) : {}),
  });
  return await handleDBKnownErrors(dbQuery);
};

export const findFilteredComments = async (
  options?: CommentFiltrationOptions,
  extraWhereClause = {}
) => {
  const authorId = options?.authorId;
  const dbQuery = db.comment.findMany({
    where: {
      ...extraWhereClause,
      ...(authorId
        ? { OR: [{ post: { authorId } }, { post: { published: true } }] }
        : { post: { published: true } }),
      ...(options?.text
        ? { content: { contains: options.text, mode: 'insensitive' } }
        : {}),
    },
    include: fieldsToIncludeWithComment,
    ...(options ? getPaginationArgs(options) : {}),
  });
  const comments = await handleDBKnownErrors(dbQuery);
  return comments;
};

export const findFilteredVotes = async (
  options?: VoteFiltrationOptions,
  extraWhereClause = {}
) => {
  const authorId = options?.authorId;
  const isUpvote = options?.isUpvote;
  const dbQuery = db.voteOnPost.findMany({
    where: {
      ...extraWhereClause,
      ...(authorId
        ? { OR: [{ post: { authorId } }, { post: { published: true } }] }
        : { post: { published: true } }),
      ...(typeof isUpvote === 'boolean' ? { isUpvote } : {}),
    },
    include: fieldsToIncludeWithVote,
  });
  const comments = await handleDBKnownErrors(dbQuery);
  return comments;
};

export default {
  createJwtForUser,
  catchDBKnownError,
  findFilteredVotes,
  findFilteredPosts,
  prepPaginationArgs: getPaginationArgs,
  handleDBKnownErrors,
  findFilteredComments,
  fieldsToIncludeWithPost,
  fieldsToIncludeWithVote,
  getTextFilterFromReqQuery,
  fieldsToIncludeWithComment,
  getPaginationFiltersFromReq,
  getSignedInUserIdFromReqQuery,
  getVoteTypeFilterFromReqQuery,
  getCategoriesFilterFromReqQuery,
  getPostFilterOptionsFromReqQuery,
  getVoteFilterOptionsFromReqQuery,
  getCommentFilterOptionsFromReqQuery,
};
