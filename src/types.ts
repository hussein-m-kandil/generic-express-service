import { postSchema, commentSchema } from '@/api/v1/posts';
import { PrismaClient, Prisma } from '@/../prisma/client';
import { imageSchema } from '@/api/v1/images';
import { userSchema } from '@/api/v1/users';
import { JwtPayload } from 'jsonwebtoken';
import { z } from 'zod';

export interface DBKnownErrorsHandlerOptions {
  notFoundErrMsg?: string;
  uniqueFieldName?: string;
}

export interface UserSensitiveDataToOmit {
  password: true;
}

export interface UserDataToAggregate {
  avatar: { omit: ImageSensitiveDataToOmit };
}

export interface UserAggregation {
  omit: UserSensitiveDataToOmit;
  include: UserDataToAggregate;
}

export type PublicUser = Prisma.UserGetPayload<{
  include: UserAggregation['include'];
  omit: UserAggregation['omit'];
}>;

export interface ImageSensitiveDataToOmit {
  storageId: true;
  storageFullPath: true;
}

export interface OmitImageSensitiveData {
  omit: ImageSensitiveDataToOmit;
}

export interface ImageDataToAggregate {
  _count: { select: { posts: true } };
  owner: UserAggregation;
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
    _count: { select: { comments: true; votes: true } };
    image: { omit: ImageSensitiveDataToOmit; include: ImageDataToAggregate };
    comments: { include: { author: UserAggregation } };
    votes: { include: { user: UserAggregation } };
    author: UserAggregation;
    tags: true;
  };
}>;

export type NewPostParsedData = z.output<typeof postSchema>;

export type NewPostAuthorizedData = NewPostParsedData & { authorId: string };

export type NewCommentParsedData = z.output<typeof commentSchema>;

export interface BaseFilters {
  currentUserId?: string;
  authorId?: string;
}

export interface PaginationFilters extends BaseFilters {
  sort?: Prisma.SortOrder;
  cursor?: number;
  limit?: number;
}

export type TagsFilter = string[];

export interface PostFilters extends PaginationFilters {
  tags?: TagsFilter;
  text?: string;
}

export interface CommentFilters extends PaginationFilters {
  postId?: string;
  text?: string;
}

export interface VoteFilters extends PaginationFilters {
  isUpvote?: boolean;
  postId?: string;
}

export interface ImageMetadata {
  mimetype: string;
  height: number;
  width: number;
  size: number;
}

export interface ImageFile extends Express.Multer.File, ImageMetadata {
  format: string;
  ext: string;
}

export type ImageDataInput = z.output<typeof imageSchema>;

export type FullImageData = ImageDataInput & ImageMetadata;
