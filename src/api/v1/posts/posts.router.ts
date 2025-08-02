import * as Exp from 'express';
import * as Types from '@/types';
import * as Utils from '@/lib/utils';
import * as Schema from './post.schema';
import * as Service from './posts.service';
import * as Validators from '@/middlewares/validators';

export const postsRouter = Exp.Router();

const getPostAuthorIdAndInjectPostInResLocals = async (
  req: Exp.Request,
  res: Exp.Response
) => {
  const userId = Utils.getCurrentUserIdFromReq(req);
  const post = await Service.findPostByIdOrThrow(req.params.id, userId);
  res.locals.post = post;
  return post.authorId;
};

const getCommentAuthorId = async (req: Exp.Request) => {
  const userId = Utils.getCurrentUserIdFromReq(req);
  const comment = await Service.findPostCommentByCompoundIdOrThrow(
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
    Validators.optionalAuthValidator,
    async (req: Exp.Request, res: Exp.Response) => {
      const userId = Utils.getCurrentUserIdFromReq(req);
      res.json(await postService(req.params.id, userId));
    },
  ];
};

postsRouter.get('/', Validators.optionalAuthValidator, async (req, res) => {
  const filters = Utils.getPostFiltersFromReqQuery(req);
  const posts = await Service.findFilteredPosts(filters);
  res.json(posts);
});

postsRouter.get(
  '/count',
  Validators.optionalAuthValidator,
  async (req, res) => {
    const filters = Utils.getPostFiltersFromReqQuery(req);
    res.json(await Service.findFilteredPosts(filters, 'count'));
  }
);

postsRouter.get('/categories', async (req, res) => {
  const categoriesFilter = Utils.getCategoriesFilterFromReqQuery(req);
  res.json(await Service.getCategories(categoriesFilter));
});

postsRouter.get(
  '/comments',
  Validators.optionalAuthValidator,
  async (req, res) => {
    const commentsFilter = Utils.getCommentFiltersFromReqQuery(req);
    res.json(await Service.findFilteredComments(commentsFilter));
  }
);

postsRouter.get(
  '/votes',
  Validators.optionalAuthValidator,
  async (req, res) => {
    const votesFilter = Utils.getVoteFiltersFromReqQuery(req);
    res.json(await Service.findFilteredVotes(votesFilter));
  }
);

postsRouter.get(
  '/categories/count',
  Validators.authValidator,
  async (req, res) => {
    const user = req.user as Types.PublicUser;
    const categoriesCount = await Service.countPostsCategoriesByPostsAuthorId(
      user.id
    );
    res.json(categoriesCount);
  }
);

postsRouter.get(
  '/comments/count',
  Validators.optionalAuthValidator,
  async (req, res) => {
    const commentsFilter = Utils.getCommentFiltersFromReqQuery(req);
    res.json(await Service.findFilteredComments(commentsFilter, 'count'));
  }
);

postsRouter.get(
  '/votes/count',
  Validators.optionalAuthValidator,
  async (req, res) => {
    const votesFilter = Utils.getVoteFiltersFromReqQuery(req);
    res.json(await Service.findFilteredVotes(votesFilter, 'count'));
  }
);

postsRouter.get(
  '/:id',
  createHandlersForGettingPrivatePostData(Service.findPostByIdOrThrow)
);

postsRouter.get(
  '/:id/votes/count',
  createHandlersForGettingPrivatePostData(Service.countPostVotes)
);

postsRouter.get(
  '/:id/categories',
  createHandlersForGettingPrivatePostData(Service.findPostCategories)
);

postsRouter.get(
  '/:id/comments',
  Validators.optionalAuthValidator,
  async (req: Exp.Request, res: Exp.Response) => {
    const postId = req.params.id;
    const filters = { ...Utils.getCommentFiltersFromReqQuery(req), postId };
    res.json(await Service.findFilteredComments(filters));
  }
);

postsRouter.get(
  '/:id/votes',
  Validators.optionalAuthValidator,
  async (req: Exp.Request, res: Exp.Response) => {
    const filters = {
      ...Utils.getVoteFiltersFromReqQuery(req),
      postId: req.params.id,
    };
    res.json(await Service.findFilteredVotes(filters));
  }
);

postsRouter.get(
  '/:id/categories/count',
  createHandlersForGettingPrivatePostData(Service.countPostCategories)
);

postsRouter.get(
  '/:id/comments/count',
  createHandlersForGettingPrivatePostData(Service.countPostComments)
);

postsRouter.get(
  '/:pId/comments/:cId',
  Validators.optionalAuthValidator,
  async (req, res) => {
    const userId = Utils.getCurrentUserIdFromReq(req);
    res.json(
      await Service.findPostCommentByCompoundIdOrThrow(
        req.params.pId,
        req.params.cId,
        userId
      )
    );
  }
);

postsRouter.post('/', Validators.authValidator, async (req, res) => {
  const user = req.user as Types.PublicUser;
  const postData = { ...Schema.postSchema.parse(req.body), authorId: user.id };
  const createdPost = await Service.createPost(postData);
  res.status(201).json(createdPost);
});

postsRouter.post('/:id/upvote', Validators.authValidator, async (req, res) => {
  const user = req.user as Types.PublicUser;
  const upvotedPost = await Service.upvotePost(req.params.id, user.id);
  res.json(upvotedPost);
});

postsRouter.post(
  '/:id/downvote',
  Validators.authValidator,
  async (req, res) => {
    const user = req.user as Types.PublicUser;
    const downvotedPost = await Service.downvotePost(req.params.id, user.id);
    res.json(downvotedPost);
  }
);

postsRouter.post('/:id/unvote', Validators.authValidator, async (req, res) => {
  const user = req.user as Types.PublicUser;
  const unvotedPost = await Service.unvotePost(req.params.id, user.id);
  res.json(unvotedPost);
});

postsRouter.post(
  '/:id/comments',
  Validators.authValidator,
  async (
    req: Exp.Request<{ id: string }, unknown, { content: string }>,
    res
  ) => {
    const user = req.user as Types.PublicUser;
    const commentData = Schema.commentSchema.parse(req.body);
    const newComment = await Service.findPostByIdAndCreateComment(
      req.params.id,
      user.id,
      commentData
    );
    res.status(200).json(newComment);
  }
);

postsRouter.put(
  '/:id',
  Validators.authValidator,
  Validators.createAdminOrOwnerValidator(
    getPostAuthorIdAndInjectPostInResLocals
  ),
  async (req, res) => {
    const postData = Schema.postSchema.parse(req.body);
    const createdPost = await Service.updatePost(req.params.id, postData);
    res.json(createdPost);
  }
);

postsRouter.put(
  '/:pId/comments/:cId',
  Validators.authValidator,
  Validators.createOwnerValidator(getCommentAuthorId),
  async (req, res) => {
    const user = req.user as Types.PublicUser;
    const commentData = Schema.commentSchema.parse(req.body);
    const updatedComment = await Service.findCommentAndUpdate(
      req.params.cId,
      user.id,
      commentData
    );
    res.json(updatedComment);
  }
);

postsRouter.delete(
  '/:id',
  Validators.authValidator,
  Validators.createAdminOrOwnerValidator(
    async (req, res) => await getPostAuthorIdAndInjectPostInResLocals(req, res)
  ),
  async (req, res: Exp.Response<unknown, { post: Types.PostFullData }>) => {
    const userId = Utils.getCurrentUserIdFromReq(req);
    await Service.deletePost(res.locals.post, userId);
    res.status(204).end();
  }
);

postsRouter.delete(
  '/:pId/comments/:cId',
  Validators.authValidator,
  Validators.createAdminOrOwnerValidator(async (req, res) => {
    const userId = Utils.getCurrentUserIdFromReq(req);
    req.params.id = req.params.pId; // For `getPostAuthorId(req)`
    const postAuthorId = await getPostAuthorIdAndInjectPostInResLocals(
      req,
      res
    );
    return postAuthorId === userId
      ? postAuthorId
      : await getCommentAuthorId(req);
  }),
  async (req, res) => {
    const userId = Utils.getCurrentUserIdFromReq(req);
    await Service.findCommentAndDelete(req.params.cId, userId);
    res.status(204).end();
  }
);
