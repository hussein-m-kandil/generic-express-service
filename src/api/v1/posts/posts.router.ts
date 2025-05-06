import { Request, Router } from 'express';
import { AppJwtPayload } from '../../../types';
import {
  authValidator,
  createOwnerValidator,
  createAdminOrOwnerValidator,
} from '../../../middlewares/validators';
import postsService from './posts.service';
import postSchema, { commentSchema } from './post.schema';
import { AppNotFoundError } from '../../../lib/app-error';

const getPostAuthorId = async (req: Request) => {
  const post = await postsService.findPostByIdOrThrow(req.params.id);
  return post.authorId;
};

const getCommentAuthorId = async (req: Request) => {
  const comment = await postsService.findPostCommentByCompoundIdOrThrow(
    req.params.pId,
    req.params.cId
  );
  return comment.authorId;
};

export const postsRouter = Router();

postsRouter.get('/', async (req, res) => {
  res.json(await postsService.getAllPosts());
});

postsRouter.get('/:id', async (req, res) => {
  const post = await postsService.findPostByIdOrThrow(req.params.id);
  res.json(post);
});

postsRouter.post('/', authValidator, async (req, res) => {
  const user = req.user as AppJwtPayload;
  const postData = { ...postSchema.parse(req.body), authorId: user.id };
  const createdPost = await postsService.createPost(postData);
  res.status(201).json(createdPost);
});

postsRouter.put(
  '/:id',
  authValidator,
  createAdminOrOwnerValidator(getPostAuthorId),
  async (req, res) => {
    const postData = postSchema.parse(req.body);
    const createdPost = await postsService.updatePost(req.params.id, postData);
    res.json(createdPost);
  }
);

postsRouter.delete(
  '/:id',
  authValidator,
  createAdminOrOwnerValidator(async (req, res) => {
    const user = req.user as AppJwtPayload;
    try {
      return await getPostAuthorId(req);
    } catch (error) {
      if (error instanceof AppNotFoundError) {
        res.locals.resourceNotFound = true;
        return user.id;
      } else {
        throw error;
      }
    }
  }),
  async (req, res) => {
    if (!res.locals.resourceNotFound) {
      await postsService.deletePost(req.params.id);
    }
    res.status(204).end();
  }
);

postsRouter.get('/:id/votes', async (req, res) => {
  const postVotes = await postsService.getAllPostVotes(req.params.id);
  res.json(postVotes);
});

postsRouter.post('/:id/upvote', authValidator, async (req, res) => {
  const user = req.user as AppJwtPayload;
  const upvotedPost = await postsService.upvotePost(req.params.id, user.id);
  res.json(upvotedPost);
});

postsRouter.post('/:id/downvote', authValidator, async (req, res) => {
  const user = req.user as AppJwtPayload;
  const downvotedPost = await postsService.downvotePost(req.params.id, user.id);
  res.json(downvotedPost);
});

postsRouter.get('/:id/comments', async (req, res) => {
  const post = await postsService.findPostByIdOrThrow(req.params.id);
  res.json(post.comments);
});

postsRouter.get('/:pId/comments/:cId', async (req, res) => {
  const comment = await postsService.findPostCommentByCompoundIdOrThrow(
    req.params.pId,
    req.params.cId
  );
  res.json(comment);
});

postsRouter.post(
  '/:id/comments',
  authValidator,
  async (req: Request<{ id: string }, unknown, { content: string }>, res) => {
    const user = req.user as AppJwtPayload;
    const commentData = commentSchema.parse(req.body);
    const createdComment = await postsService.findPostByIdAndCreateComment(
      req.params.id,
      user.id,
      commentData
    );
    res.status(201).json(createdComment);
  }
);

postsRouter.put(
  '/:pId/comments/:cId',
  authValidator,
  createOwnerValidator(getCommentAuthorId),
  async (req, res) => {
    const user = req.user as AppJwtPayload;
    const commentData = commentSchema.parse(req.body);
    const updatedComment =
      await postsService.findPostCommentByCompoundIdAndUpdate(
        req.params.pId,
        user.id,
        req.params.cId,
        commentData
      );
    res.json(updatedComment);
  }
);

postsRouter.delete(
  '/:pId/comments/:cId',
  authValidator,
  createAdminOrOwnerValidator(async (req, res) => {
    const user = req.user as AppJwtPayload;
    try {
      req.params.id = req.params.pId; // For getting post author
      const postAuthorId = await getPostAuthorId(req);
      return postAuthorId === user.id
        ? postAuthorId
        : await getCommentAuthorId(req);
    } catch (error) {
      if (error instanceof AppNotFoundError) {
        res.locals.resourceNotFound = true;
        return user.id;
      } else {
        throw error;
      }
    }
  }),
  async (req, res) => {
    if (!res.locals.resourceNotFound) {
      await postsService.findPostCommentByCompoundIdAndDelete(
        req.params.pId,
        req.params.cId
      );
    }
    res.status(204).end();
  }
);

export default postsRouter;
