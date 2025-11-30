import { usersData, IMAGE_BASE_URL, characters } from './data';
import { PrismaClient, Prisma, User, Image } from '../client';
import { createPostsData } from './utils';
import { faker } from '@faker-js/faker';
import bcrypt from 'bcryptjs';

console.log('Connecting...');
const db = new PrismaClient();

async function main() {
  const AUTHOR_PASSWORD = process.env.AUTHOR_PASSWORD;

  if (!AUTHOR_PASSWORD) {
    throw Error('The environment variable `AUTHOR_PASSWORD` is missed');
  }

  const { postsData, oldestPostDate } = createPostsData();

  await db.$transaction(
    async (transClient) => {
      const registerCreation = async (
        data: Omit<Required<Prisma.CreationCreateInput>, 'id' | 'isAdmin'>
      ) => {
        await transClient.creation.create({ data: { ...data, isAdmin: true } });
      };

      console.log('Resetting the database...');

      await transClient.comment.deleteMany({});
      await transClient.votesOnPosts.deleteMany({});
      await transClient.tagsOnPosts.deleteMany({});
      await transClient.post.deleteMany({});
      await transClient.image.deleteMany({});
      await transClient.user.deleteMany({});
      await transClient.tag.deleteMany({});
      await transClient.creation.deleteMany({ where: { isAdmin: true } });

      console.log('Seeding the database...');

      const dbPostAuthors: User[] = [];

      for (const { username, fullname, bio } of usersData) {
        const createdAt = faker.date.past({
          years: 1,
          refDate: oldestPostDate,
        });
        dbPostAuthors.push(
          await transClient.user.create({
            data: {
              password: await bcrypt.hash(AUTHOR_PASSWORD, 10),
              profile: { create: { lastSeen: new Date() } },
              updatedAt: createdAt,
              isAdmin: true,
              createdAt,
              username,
              fullname,
              bio,
            },
          })
        );
        await registerCreation({ model: 'USER', username, createdAt });
      }

      for (const postData of postsData) {
        const postAuthor = dbPostAuthors[postData.authorIndex];

        let dbImage: Image | undefined;
        if (postData.imagePath) {
          const createdAt = new Date(postData.date.getTime() - 1000);
          const { id: ownerId, username } = postAuthor;
          dbImage = await transClient.image.create({
            data: {
              src: `${IMAGE_BASE_URL}${postData.imagePath}`,
              storageFullPath: postData.imagePath,
              storageId: crypto.randomUUID(),
              mimetype: 'image/jpeg',
              createdAt: createdAt,
              updatedAt: createdAt,
              size: 7654321,
              height: 1080,
              width: 1920,
              ownerId,
            },
          });
          await registerCreation({ model: 'IMAGE', createdAt, username });
        }

        const dbPost = await transClient.post.create({
          data: {
            published: true,
            imageId: dbImage?.id,
            title: postData.title,
            authorId: postAuthor.id,
            createdAt: postData.date,
            updatedAt: postData.date,
            content: postData.content,
            tags: {
              create: postData.tags.map((name) => ({
                tag: { connectOrCreate: { where: { name }, create: { name } } },
              })),
            },
          },
        });
        await registerCreation({
          model: 'POST',
          createdAt: postData.date,
          username: postAuthor.username,
        });

        for (const commentData of postData.comments) {
          const commentAuthor = dbPostAuthors[commentData.authorIndex];
          await transClient.comment.create({
            data: {
              content: commentData.content,
              createdAt: commentData.date,
              updatedAt: commentData.date,
              authorId: commentAuthor.id,
              postId: dbPost.id,
            },
          });
          await registerCreation({
            model: 'COMMENT',
            createdAt: commentData.date,
            username: commentAuthor.username,
          });
        }

        for (const voteData of postData.votes) {
          const voter = dbPostAuthors[voteData.userIndex];
          await transClient.votesOnPosts.create({
            data: {
              isUpvote: voteData.isUpVote,
              createdAt: voteData.date,
              updatedAt: voteData.date,
              postId: dbPost.id,
              userId: voter.id,
            },
          });
          await registerCreation({
            model: 'VOTE',
            createdAt: voteData.date,
            username: voter.username,
          });
        }
      }

      const dbCharacterRectCount = await transClient.characterRect.count();
      if (dbCharacterRectCount < characters.length) {
        console.log('Seeding the database with characters...');
        for (const data of characters) {
          const { name } = data;
          await transClient.characterRect.upsert({ where: { name }, create: data, update: data });
        }
      }
    },
    {
      maxWait: 15000, // default: 2000
      timeout: 90000, // default: 5000
    }
  );
}

const disconnect = async () => {
  console.log('Disconnecting...');
  await db.$disconnect();
  console.log('Done.');
};

main()
  .then(disconnect)
  .catch(async (e: unknown) => {
    console.error(e);
    await disconnect();
    process.exit(1);
  });

export const seed = main;

export default main;
