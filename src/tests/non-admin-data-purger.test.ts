import db from '@/lib/db';
import express from 'express';
import setup from './api/setup';
import { BASE_URL, POSTS_URL, SIGNIN_URL } from './api/v1/utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as Middlewares from '@/middlewares';
import * as Utils from '@/lib/utils';
import * as API from '@/api';

const app = express()
  .use(Middlewares.nonAdminDataPurger)
  .use(BASE_URL, API.V1.apiRouter);

describe('Non-Admin Purge', () => {
  afterEach(async () => {
    vi.setSystemTime(vi.getRealSystemTime());
    await db.comment.deleteMany({});
    await db.votesOnPosts.deleteMany({});
    await db.tagsOnPosts.deleteMany({});
    await db.post.deleteMany({});
    await db.tag.deleteMany({});
    await db.image.deleteMany({});
    await db.user.deleteMany({});
  });

  it('should purge only non-admin data on GET request after passing the purge interval', async () => {
    const {
      api,
      dbAdmin,
      dbXUser,
      imgData,
      dbUserOne,
      dbUserTwo,
      createPost,
      createImage,
      postFullData,
    } = await setup(SIGNIN_URL, app);
    const nonAdminTags = ['non-admin-tag-1', 'non-admin-tag-2'];
    const dbNonAdminPost = await createPost({
      ...postFullData,
      authorId: dbUserOne.id,
      tags: [...postFullData.tags, ...nonAdminTags],
    });
    const dbNonAdminImg = await createImage({
      ...imgData,
      ownerId: dbUserOne.id,
    });
    const dbAdminPost = await createPost({
      ...postFullData,
      authorId: dbAdmin.id,
    });
    const dbAdminImg = await createImage({
      ...imgData,
      src: 'https://test.foo/img.png',
      ownerId: dbAdmin.id,
    });
    vi.setSystemTime(Date.now() + Utils.PURGE_INTERVAL_MS);
    await api.get(POSTS_URL);
    expect(await db.user.findUnique({ where: { id: dbXUser.id } })).toBeNull();
    expect(
      await db.user.findUnique({
        where: { id: dbUserOne.id },
      })
    ).toBeNull();
    expect(
      await db.user.findUnique({ where: { id: dbUserTwo.id } })
    ).toBeNull();
    expect(
      await db.image.findUnique({
        where: { id: dbNonAdminImg.id },
        include: { owner: true },
      })
    ).toBeNull();
    expect(
      await db.post.findUnique({ where: { id: dbNonAdminPost.id } })
    ).toBeNull();
    expect(
      await db.tag.findMany({ where: { name: { in: nonAdminTags } } })
    ).toHaveLength(0);
    expect(
      await db.user.findUnique({ where: { id: dbAdmin.id } })
    ).not.toBeNull();
    expect(
      await db.image.findUnique({ where: { id: dbAdminImg.id } })
    ).not.toBeNull();
    expect(
      await db.post.findUnique({ where: { id: dbAdminPost.id } })
    ).not.toBeNull();
  });

  it('should not purge any data on non-GET request after passing the purge interval', async () => {
    const {
      api,
      dbAdmin,
      dbXUser,
      imgData,
      dbUserOne,
      dbUserTwo,
      createPost,
      createImage,
      postFullData,
    } = await setup(SIGNIN_URL, app);
    const nonAdminTags = ['non-admin-tag-1', 'non-admin-tag-2'];
    const dbNonAdminPost = await createPost({
      ...postFullData,
      authorId: dbUserOne.id,
      tags: [...postFullData.tags, ...nonAdminTags],
    });
    const dbNonAdminImg = await createImage({
      ...imgData,
      ownerId: dbUserOne.id,
    });
    const dbAdminPost = await createPost({
      ...postFullData,
      authorId: dbAdmin.id,
    });
    const dbAdminImg = await createImage({
      ...imgData,
      src: 'https://test.foo/img.png',
      ownerId: dbAdmin.id,
    });
    vi.setSystemTime(Date.now() + Utils.PURGE_INTERVAL_MS);
    const requests = [
      api.post(POSTS_URL),
      api.put(POSTS_URL),
      api.delete(POSTS_URL),
      api.patch(POSTS_URL),
      api.options(POSTS_URL),
    ];
    for (const req of requests) {
      await req;
      expect(
        await db.user.findUnique({ where: { id: dbXUser.id } })
      ).not.toBeNull();
      expect(
        await db.user.findUnique({
          where: { id: dbUserOne.id },
        })
      ).not.toBeNull();
      expect(
        await db.user.findUnique({ where: { id: dbUserTwo.id } })
      ).not.toBeNull();
      expect(
        await db.image.findUnique({
          where: { id: dbNonAdminImg.id },
          include: { owner: true },
        })
      ).not.toBeNull();
      expect(
        await db.post.findUnique({ where: { id: dbNonAdminPost.id } })
      ).not.toBeNull();
      expect(
        await db.tag.findMany({ where: { name: { in: nonAdminTags } } })
      ).toHaveLength(nonAdminTags.length);
      expect(
        await db.user.findUnique({ where: { id: dbAdmin.id } })
      ).not.toBeNull();
      expect(
        await db.image.findUnique({ where: { id: dbAdminImg.id } })
      ).not.toBeNull();
      expect(
        await db.post.findUnique({ where: { id: dbAdminPost.id } })
      ).not.toBeNull();
    }
  });

  it('should not purge any data on GET request before passing the purge interval', async () => {
    const {
      api,
      dbAdmin,
      dbXUser,
      imgData,
      dbUserOne,
      dbUserTwo,
      createPost,
      createImage,
      postFullData,
    } = await setup(SIGNIN_URL, app);
    const nonAdminTags = ['non-admin-tag-1', 'non-admin-tag-2'];
    const dbNonAdminPost = await createPost({
      ...postFullData,
      authorId: dbUserOne.id,
      tags: [...postFullData.tags, ...nonAdminTags],
    });
    const dbNonAdminImg = await createImage({
      ...imgData,
      ownerId: dbUserOne.id,
    });
    const dbAdminPost = await createPost({
      ...postFullData,
      authorId: dbAdmin.id,
    });
    const dbAdminImg = await createImage({
      ...imgData,
      src: 'https://test.foo/img.png',
      ownerId: dbAdmin.id,
    });
    vi.setSystemTime(Date.now() + (Utils.PURGE_INTERVAL_MS - 1)); // Just 1 ms before passing purge interval
    await api.get(POSTS_URL);
    expect(
      await db.user.findUnique({ where: { id: dbXUser.id } })
    ).not.toBeNull();
    expect(
      await db.user.findUnique({
        where: { id: dbUserOne.id },
      })
    ).not.toBeNull();
    expect(
      await db.user.findUnique({ where: { id: dbUserTwo.id } })
    ).not.toBeNull();
    expect(
      await db.image.findUnique({
        where: { id: dbNonAdminImg.id },
        include: { owner: true },
      })
    ).not.toBeNull();
    expect(
      await db.post.findUnique({ where: { id: dbNonAdminPost.id } })
    ).not.toBeNull();
    expect(
      await db.tag.findMany({ where: { name: { in: nonAdminTags } } })
    ).toHaveLength(nonAdminTags.length);
    expect(
      await db.user.findUnique({ where: { id: dbAdmin.id } })
    ).not.toBeNull();
    expect(
      await db.image.findUnique({ where: { id: dbAdminImg.id } })
    ).not.toBeNull();
    expect(
      await db.post.findUnique({ where: { id: dbAdminPost.id } })
    ).not.toBeNull();
  });
});
