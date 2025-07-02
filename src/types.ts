import { postSchema, commentSchema } from './api/v1/posts/post.schema';
import { PrismaClient, Prisma } from '../prisma/generated/client';
import { userSchema } from './api/v1/users/user.schema';
import { JwtPayload } from 'jsonwebtoken';
import { z } from 'zod';

export interface DBKnownErrorsHandlerOptions {
  notFoundErrMsg?: string;
  uniqueFieldName?: string;
}

export interface UserSensitiveDataToOmit {
  password: true;
}

export interface OmitUserSensitiveData {
  omit: UserSensitiveDataToOmit;
}

export type PublicUser = Prisma.UserGetPayload<OmitUserSensitiveData>;

export interface ImageSensitiveDataToOmit {
  storageId: true;
  storageFullPath: true;
}

export interface OmitImageSensitiveData {
  omit: ImageSensitiveDataToOmit;
}

export interface ImageDataToAggregate {
  owner: OmitUserSensitiveData;
}

export type PublicImage = Prisma.ImageGetPayload<{
  omit: ImageSensitiveDataToOmit;
  include: ImageDataToAggregate;
}>;

export type CustomPrismaClient = PrismaClient<{
  omit: { image: ImageSensitiveDataToOmit; user: UserSensitiveDataToOmit };
}>;

export type NewUserInput = z.input<typeof userSchema>;

export type NewUserOutput = z.output<typeof userSchema>;

export type JwtUser = Prisma.UserGetPayload<{
  select: { id: true; isAdmin: true };
}>;

export type AppJwtPayload = JwtPayload & JwtUser;

export interface AuthResponse {
  user: PublicUser;
  token: string;
}

export interface AppErrorResponse {
  error: {
    name: string;
    message: string;
  };
}

export type PostFullData = Prisma.PostGetPayload<{
  include: {
    image: { omit: ImageSensitiveDataToOmit; include: ImageDataToAggregate };
    comments: { include: { author: OmitUserSensitiveData } };
    votes: { include: { user: OmitUserSensitiveData } };
    author: OmitUserSensitiveData;
    categories: true;
  };
}>;

export type NewPostParsedData = z.output<typeof postSchema>;

export type NewPostAuthorizedData = NewPostParsedData & { authorId: string };

export type NewCommentParsedData = z.output<typeof commentSchema>;

export interface PostFiltrationOptions {
  authorId?: string;
  text?: string;
  categories?: string[];
}

export interface CommentFiltrationOptions {
  authorId?: string;
  postId?: string;
  text?: string;
}

export interface VoteFiltrationOptions {
  authorId?: string;
  isUpvote?: boolean;
}
