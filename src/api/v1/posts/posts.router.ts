import * as Types from '@/types';
import * as Image from '@/lib/image';
import * as Utils from '@/lib/utils';
import * as Schema from './post.schema';
import * as Storage from '@/lib/storage';
import * as Service from './posts.service';
import * as Middlewares from '@/middlewares';
import { Router, Request, Response } from 'express';

export const postsRouter = Router();

const getPostAuthorIdAndInjectPostInResLocals = async (
  req: Request,
  res: Response
) => {
  const userId = Utils.getCurrentUserIdFromReq(req);
  const post = await Service._findPostWithAggregationOrThrow(
    req.params.id,
    userId
  );
  res.locals.post = post;
  return post.authorId;
};

const getCommentAuthorId = async (req: Request) => {
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
    Middlewares.optionalAuthValidator,
    async (req: Request, res: Response) => {
      const userId = Utils.getCurrentUserIdFromReq(req);
      res.json(await postService(req.params.id, userId));
    },
  ];
};

postsRouter.get('/', Middlewares.optionalAuthValidator, async (req, res) => {
  const filters = Utils.getPostFiltersFromReqQuery(req);
  const posts = await Service.findFilteredPosts(filters);
  res.json(posts);
});

postsRouter.get(
  '/count',
  Middlewares.optionalAuthValidator,
  async (req, res) => {
    const filters = Utils.getPostFiltersFromReqQuery(req);
    res.json(await Service.findFilteredPosts(filters, 'count'));
  }
);

postsRouter.get('/tags', async (req, res) => {
  const tagsFilter = Utils.getTagsFilterFromReqQuery(req);
  res.json(await Service.getTags(tagsFilter));
});

postsRouter.get(
  '/comments',
  Middlewares.optionalAuthValidator,
  async (req, res) => {
    const commentsFilter = Utils.getCommentFiltersFromReqQuery(req);
    res.json(await Service.findFilteredComments(commentsFilter));
  }
);

postsRouter.get(
  '/votes',
  Middlewares.optionalAuthValidator,
  async (req, res) => {
    const votesFilter = Utils.getVoteFiltersFromReqQuery(req);
    res.json(await Service.findFilteredVotes(votesFilter));
  }
);

postsRouter.get('/tags/count', async (req, res) => {
  const postAuthorId = Utils.getAuthorIdFilterFromReqQuery(req);
  res.json(await Service.countTagsOnPosts(postAuthorId));
});

postsRouter.get(
  '/comments/count',
  Middlewares.optionalAuthValidator,
  async (req, res) => {
    const commentsFilter = Utils.getCommentFiltersFromReqQuery(req);
    res.json(await Service.findFilteredComments(commentsFilter, 'count'));
  }
);

postsRouter.get(
  '/votes/count',
  Middlewares.optionalAuthValidator,
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
  '/:id/tags',
  createHandlersForGettingPrivatePostData(Service.findPostTags)
);

postsRouter.get(
  '/:id/comments',
  Middlewares.optionalAuthValidator,
  async (req: Request, res: Response) => {
    const postId = req.params.id;
    const filters = { ...Utils.getCommentFiltersFromReqQuery(req), postId };
    res.json(await Service.findFilteredComments(filters));
  }
);

postsRouter.get(
  '/:id/votes',
  Middlewares.optionalAuthValidator,
  async (req: Request, res: Response) => {
    const filters = {
      ...Utils.getVoteFiltersFromReqQuery(req),
      postId: req.params.id,
    };
    res.json(await Service.findFilteredVotes(filters));
  }
);

postsRouter.get(
  '/:id/tags/count',
  createHandlersForGettingPrivatePostData(Service.countPostTags)
);

postsRouter.get(
  '/:id/comments/count',
  createHandlersForGettingPrivatePostData(Service.countPostComments)
);

postsRouter.get(
  '/:pId/comments/:cId',
  Middlewares.optionalAuthValidator,
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

postsRouter.post(
  '/',
  Middlewares.authValidator,
  Middlewares.createFileProcessor('image'),
  async (req: Request, res: Response) => {
    const user = req.user as Types.PublicUser;
    const { imagedata, ...postData } = Schema.postSchema.parse(req.body);
    let createdPost;
    if (req.file) {
      const file = await Image.getValidImageFileFormReq(req);
      const imageData = {
        ...(imagedata ?? {}),
        ...Image.getImageMetadata(file),
      };
      const uploadedImage = await Storage.uploadImage(file, user);
      createdPost = await Service.createPostWithImage(
        postData,
        user,
        imageData,
        uploadedImage
      );
    } else {
      createdPost = await Service.createPost(postData, user);
    }
    res.status(201).json(createdPost);
  }
);

postsRouter.post('/:id/upvote', Middlewares.authValidator, async (req, res) => {
  const user = req.user as Types.PublicUser;
  const upvotedPost = await Service.upvotePost(req.params.id, user.id);
  res.json(upvotedPost);
});

postsRouter.post(
  '/:id/downvote',
  Middlewares.authValidator,
  async (req, res) => {
    const user = req.user as Types.PublicUser;
    const downvotedPost = await Service.downvotePost(req.params.id, user.id);
    res.json(downvotedPost);
  }
);

postsRouter.post('/:id/unvote', Middlewares.authValidator, async (req, res) => {
  const user = req.user as Types.PublicUser;
  const unvotedPost = await Service.unvotePost(req.params.id, user.id);
  res.json(unvotedPost);
});

postsRouter.post(
  '/:id/comments',
  Middlewares.authValidator,
  async (req: Request<{ id: string }, unknown, { content: string }>, res) => {
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
  Middlewares.authValidator,
  Middlewares.createAdminOrOwnerValidator(
    getPostAuthorIdAndInjectPostInResLocals
  ),
  Middlewares.createFileProcessor('image'),
  async (
    req: Request,
    res: Response<unknown, { post: Service._PostFullData }>
  ) => {
    const user = req.user as Types.PublicUser;
    const { post } = res.locals;
    const { imagedata, ...postData } = Schema.postSchema.parse(req.body);
    let updatedPost;
    if (req.file) {
      const file = await Image.getValidImageFileFormReq(req);
      const imageData = {
        ...(imagedata ?? {}),
        ...Image.getImageMetadata(file),
      };
      const uploadedImage = await Storage.uploadImage(file, user, post.image);
      updatedPost = await Service.updatePostWithImage(
        post,
        user,
        postData,
        imageData,
        uploadedImage
      );
    } else {
      updatedPost = await Service.updatePost(post, postData, imagedata);
    }
    res.json(updatedPost);
  }
);

postsRouter.put(
  '/:pId/comments/:cId',
  Middlewares.authValidator,
  Middlewares.createOwnerValidator(getCommentAuthorId),
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
  Middlewares.authValidator,
  Middlewares.createAdminOrOwnerValidator(
    async (req, res) => await getPostAuthorIdAndInjectPostInResLocals(req, res)
  ),
  async (req, res: Response<unknown, { post: Service._PostFullData }>) => {
    const userId = Utils.getCurrentUserIdFromReq(req);
    await Service.deletePost(res.locals.post, userId);
    res.status(204).end();
  }
);

postsRouter.delete(
  '/:pId/comments/:cId',
  Middlewares.authValidator,
  Middlewares.createAdminOrOwnerValidator(async (req, res) => {
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
