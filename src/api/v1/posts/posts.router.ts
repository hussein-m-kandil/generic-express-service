import {
  authValidator,
  createOwnerValidator,
  optionalAuthValidator,
  createAdminOrOwnerValidator,
} from '../../../middlewares/validators';
import {
  findFilteredComments,
  findFilteredPosts,
  findFilteredVotes,
  getCommentFilterOptionsFromReqQuery,
  getPostFilterOptionsFromReqQuery,
  getSignedInUserIdFromReqQuery,
  getVoteFilterOptionsFromReqQuery,
} from '../../../lib/helpers';
import { Request, Response, Router } from 'express';
import { AppJwtPayload } from '../../../types';
import postsService from './posts.service';
import postSchema, { commentSchema } from './post.schema';

const getPostAuthorId = async (req: Request) => {
  const userId = getSignedInUserIdFromReqQuery(req);
  const post = await postsService.findPostByIdOrThrow(req.params.id, userId);
  return post.authorId;
};

const getCommentAuthorId = async (req: Request) => {
  const userId = getSignedInUserIdFromReqQuery(req);
  const comment = await postsService.findPostCommentByCompoundIdOrThrow(
    req.params.pId,
    req.params.cId,
    userId
  );
  return comment.authorId;
};

const createHandlersForGettingPrivatePostData = (
  postService: (postId: string, authorId?: string) => unknown
) => {
  return [
    optionalAuthValidator,
    async (req: Request, res: Response) => {
      const userId = getSignedInUserIdFromReqQuery(req);
      res.json(await postService(req.params.id, userId));
    },
  ];
};

export const postsRouter = Router();

postsRouter.get('/', optionalAuthValidator, async (req, res) => {
  const filters = getPostFilterOptionsFromReqQuery(req);
  const posts = await findFilteredPosts(filters);
  res.json(posts);
});

postsRouter.get('/count', authValidator, async (req, res) => {
  const user = req.user as AppJwtPayload;
  const postsCount = await postsService.countPostsByAuthorId(user.id);
  res.json(postsCount);
});

postsRouter.get('/categories', async (req, res) => {
  res.json(await postsService.getAllCategories());
});

postsRouter.get('/categories/count', authValidator, async (req, res) => {
  const user = req.user as AppJwtPayload;
  const categoriesCount =
    await postsService.countPostsCategoriesByPostsAuthorId(user.id);
  res.json(categoriesCount);
});

postsRouter.get('/comments/count', authValidator, async (req, res) => {
  const user = req.user as AppJwtPayload;
  const commentsCount = await postsService.countPostsCommentsByPostsAuthorId(
    user.id
  );
  res.json(commentsCount);
});

postsRouter.get('/votes/count', authValidator, async (req, res) => {
  const user = req.user as AppJwtPayload;
  const votesCount = await postsService.countPostsVotesByPostsAuthorId(user.id);
  res.json(votesCount);
});

postsRouter.get(
  '/:id',
  createHandlersForGettingPrivatePostData(postsService.findPostByIdOrThrow)
);

postsRouter.get(
  '/:id/votes/count',
  createHandlersForGettingPrivatePostData(postsService.countPostVotes)
);

postsRouter.get(
  '/:id/categories',
  createHandlersForGettingPrivatePostData(postsService.findPostCategories)
);

postsRouter.get(
  '/:id/comments',
  optionalAuthValidator,
  async (req: Request, res: Response) => {
    const postId = req.params.id;
    const filters = getCommentFilterOptionsFromReqQuery(req);
    const comments = await findFilteredComments(filters, { postId });
    res.json(comments);
  }
);

postsRouter.get(
  '/:id/votes',
  optionalAuthValidator,
  async (req: Request, res: Response) => {
    const postId = req.params.id;
    const filters = getVoteFilterOptionsFromReqQuery(req);
    const votes = await findFilteredVotes(filters, { postId });
    res.json(votes);
  }
);

postsRouter.get(
  '/:id/categories/count',
  createHandlersForGettingPrivatePostData(postsService.countPostCategories)
);

postsRouter.get(
  '/:id/comments/count',
  createHandlersForGettingPrivatePostData(postsService.countPostComments)
);

postsRouter.get(
  '/:pId/comments/:cId',
  optionalAuthValidator,
  async (req, res) => {
    const userId = getSignedInUserIdFromReqQuery(req);
    res.json(
      await postsService.findPostCommentByCompoundIdOrThrow(
        req.params.pId,
        req.params.cId,
        userId
      )
    );
  }
);

postsRouter.post('/', authValidator, async (req, res) => {
  const user = req.user as AppJwtPayload;
  const postData = { ...postSchema.parse(req.body), authorId: user.id };
  const createdPost = await postsService.createPost(postData);
  res.status(201).json(createdPost);
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

postsRouter.post(
  '/:id/comments',
  authValidator,
  async (req: Request<{ id: string }, unknown, { content: string }>, res) => {
    const user = req.user as AppJwtPayload;
    const commentData = commentSchema.parse(req.body);
    const updatedPost = await postsService.findPostByIdAndCreateComment(
      req.params.id,
      user.id,
      commentData
    );
    res.status(200).json(updatedPost);
  }
);

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

postsRouter.put(
  '/:pId/comments/:cId',
  authValidator,
  createOwnerValidator(getCommentAuthorId),
  async (req, res) => {
    const user = req.user as AppJwtPayload;
    const commentData = commentSchema.parse(req.body);
    const updatedPost = await postsService.findPostCommentByCompoundIdAndUpdate(
      req.params.pId,
      req.params.cId,
      user.id,
      commentData
    );
    res.json(updatedPost);
  }
);

postsRouter.delete(
  '/:id',
  authValidator,
  createAdminOrOwnerValidator(async (req) => await getPostAuthorId(req)),
  async (req, res) => {
    const userId = getSignedInUserIdFromReqQuery(req);
    await postsService.deletePost(req.params.id, userId);
    res.status(204).end();
  }
);

postsRouter.delete(
  '/:pId/comments/:cId',
  authValidator,
  createAdminOrOwnerValidator(async (req) => {
    const userId = getSignedInUserIdFromReqQuery(req);
    req.params.id = req.params.pId; // For `getPostAuthorId(req)`
    const postAuthorId = await getPostAuthorId(req);
    return postAuthorId === userId
      ? postAuthorId
      : await getCommentAuthorId(req);
  }),
  async (req, res) => {
    const userId = getSignedInUserIdFromReqQuery(req);
    await postsService.findPostCommentByCompoundIdAndDelete(
      req.params.pId,
      req.params.cId,
      userId
    );
    res.status(204).end();
  }
);

export default postsRouter;
