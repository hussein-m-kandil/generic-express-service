import { PrismaClient, Prisma, Model, CharacterFinder } from '@/../prisma/client';
import { createUpdateUserSchema, userSchema } from '@/api/v1/users';
import { postSchema, commentSchema } from '@/api/v1/posts';
import { imageSchema } from '@/lib/image/schema';
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
  avatar: { select: { image: { omit: ImageSensitiveDataToOmit } } };
  profile: boolean;
}

export interface UserAggregation {
  omit: UserSensitiveDataToOmit;
  include: UserDataToAggregate;
}

export type PublicUser = Prisma.UserGetPayload<{
  include: UserAggregation['include'];
  omit: UserAggregation['omit'];
}>;

export interface ProfileAggregation {
  include: { user: UserAggregation };
}

export type PublicProfile = Prisma.ProfileGetPayload<{
  include: ProfileAggregation['include'];
}> & { followedByCurrentUser: boolean };

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

export type ImageFullData = ImageDataInput & ImageMetadata;

export type CustomPrismaClient = PrismaClient<{
  omit: { image: ImageSensitiveDataToOmit; user: UserSensitiveDataToOmit };
}>;

export type NewUserInput = z.input<typeof userSchema>;
export type NewUserOutput = z.output<typeof userSchema>;
export type UpdateUserInput = z.input<ReturnType<typeof createUpdateUserSchema>>;
export type UpdateUserOutput = z.output<ReturnType<typeof createUpdateUserSchema>>;

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

export interface BasePostCounts {
  comments: number;
  votes: number;
}

export interface PostCounts extends BasePostCounts {
  downvotes: number;
  upvotes: number;
}

export type BasePostFullData = Prisma.PostGetPayload<{
  include: {
    image: { omit: ImageSensitiveDataToOmit; include: ImageDataToAggregate };
    comments: { include: { author: UserAggregation } };
    votes: { include: { user: UserAggregation } };
    author: UserAggregation;
    tags: true;
  };
}>;

export interface PostFullData extends BasePostFullData {
  downvotedByCurrentUser: boolean;
  upvotedByCurrentUser: boolean;
  _count: PostCounts;
}

export type NewPostParsedData = z.output<typeof postSchema>;

export type NewPostParsedDataWithoutImage = Omit<NewPostParsedData, 'imagedata'>;

export type NewCommentParsedData = z.output<typeof commentSchema>;

export interface BaseFilters {
  currentUserId?: string;
  authorId?: string;
}

export interface BasePaginationFilters<CursorType = string> {
  sort?: Prisma.SortOrder;
  cursor?: CursorType;
  limit?: number;
}

export interface ProfileFilters extends BasePaginationFilters {
  name?: string;
}

export interface PaginationFilters extends BaseFilters, BasePaginationFilters<number> {}

export type TagsFilter = string[];

export interface PostFilters extends PaginationFilters {
  following: boolean;
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

export type Stats = Record<`${Lowercase<Model>}s` | 'visitors', { count: number; date: Date }[]>;

export interface EvaluationResult {
  evaluation: Record<string, boolean>;
  finder: CharacterFinder;
}
