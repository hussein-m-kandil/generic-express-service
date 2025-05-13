import { Prisma, PrismaClient, User } from '../prisma/generated/client';
import { postSchema, commentSchema } from './api/v1/posts/post.schema';
import { userSchema } from './api/v1/users/user.schema';
import { JwtPayload } from 'jsonwebtoken';
import { z } from 'zod';

export type GlobalWithPrisma = typeof globalThis & {
  prisma: PrismaClient | undefined;
};

export type NewDefaultUser = Omit<
  User,
  'id' | 'bio' | 'isAdmin' | 'createdAt' | 'updatedAt'
>;

export type PublicUser = Omit<User, 'password' | 'isAdmin'>;

export type JwtUser = Omit<PublicUser, 'bio' | 'createdAt' | 'updatedAt'>;

export type NewUserInput = z.input<typeof userSchema>;

export type NewUserOutput = z.output<typeof userSchema>;

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
    comments: { include: { author: true } };
    votes: { include: { user: true } };
    categories: true;
    author: true;
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
