import { PrismaClient } from '../client';
import { faker } from '@faker-js/faker';
import bcrypt from 'bcryptjs';

const AUTHOR_PASSWORD = process.env.AUTHOR_PASSWORD;

if (!AUTHOR_PASSWORD) {
  throw Error('The environment variable `AUTHOR_PASSWORD` is missed');
}

const titles = [
  'Why TypeScript Is Worth the Learning Curve',
  'Docker Compose for Local Development',
  'Understanding JWT: Auth Made Simple',
  'Top 5 VS Code Extensions for JavaScript Developers',
  "REST vs. GraphQL: A Developer's Perspective",
  'Mastering Zod for Schema Validation',
  'How to Secure Your Express App',
  'Deploying Node.js Apps with Koyeb',
  'CSS-in-JS: Should You Use It in 2025?',
  'How I Built a Portfolio While Learning to Code',
];

const postCount = titles.length;

const tags = [
  'open_source',
  'full_stack',
  'javaScript',
  'typeScript',
  'security',
  'frontend',
  'software',
  'testing',
  'backend',
];

const db = new PrismaClient();

async function main() {
  console.log('Resetting the database...');
  await db.$transaction([
    db.comment.deleteMany({}),
    db.voteOnPost.deleteMany({}),
    db.tagsOnPosts.deleteMany({}),
    db.post.deleteMany({}),
    db.image.deleteMany({}),
    db.user.deleteMany({}),
    db.tag.deleteMany({}),
  ]);

  console.log('Seeding the database with authors...');
  const passHashArgs = [AUTHOR_PASSWORD, 10] as [string, number];
  const dbPostAuthors = await db.user.createManyAndReturn({
    data: [
      {
        password: bcrypt.hashSync(...passHashArgs),
        bio: 'From Nowhere land with love.',
        username: 'nowhere-man',
        fullname: 'Nowhere-Man',
        isAdmin: true,
      },
      {
        password: bcrypt.hashSync(...passHashArgs),
        fullname: 'Clark Kent / Kal-El',
        bio: 'From Krypton with love.',
        username: 'superman',
        isAdmin: false,
      },
      {
        password: bcrypt.hashSync(...passHashArgs),
        bio: 'From Gotham with love.',
        fullname: 'Bruce Wayne',
        username: 'batman',
        isAdmin: false,
      },
    ],
  });

  console.log(
    'Seeding the database with images, posts, categories, comment, and votes...'
  );
  for (let i = 0; i < postCount; i++) {
    const randomCategories = faker.helpers.arrayElements(
      tags,
      faker.number.int({ min: 2, max: 3 })
    );

    const gapDays = 30; // Post / Month
    const postOrder = postCount - i;
    const dayMS = 24 * 60 * 60 * 1000;
    const postDate = faker.date.between({
      from: new Date(Date.now() - postOrder * dayMS * gapDays),
      to: new Date(Date.now() - (postOrder - 1) * dayMS * gapDays),
    });

    const postAuthor = faker.helpers.arrayElement(dbPostAuthors);
    const dbPostViewers = dbPostAuthors.filter(
      ({ id }) => id !== postAuthor.id
    );

    const dbImage = await db.image.create({
      data: {
        src: `https://ndauvqaezozccgtddhkr.supabase.co/storage/v1/object/public/images/seed/${i}.jpg`,
        storageFullPath: `images/seed/${i}.jpg`,
        storageId: crypto.randomUUID(),
        ownerId: postAuthor.id,
        mimetype: 'image/jpeg',
        size: 7654321,
        height: 1080,
        width: 1920,
        posts: {
          create: [
            {
              published: true,
              title: titles[i],
              createdAt: postDate,
              updatedAt: postDate,
              authorId: postAuthor.id,
              content: faker.lorem.paragraphs(
                faker.number.int({ min: 10, max: 15 })
              ),
              tags: {
                create: randomCategories.map((name) => ({
                  tag: {
                    connectOrCreate: { where: { name }, create: { name } },
                  },
                })),
              },
            },
          ],
        },
      },
      include: { posts: true },
    });
    const dbPost = dbImage.posts[0];

    const commentsCount = faker.number.int({ min: 3, max: 7 });
    const commentDates = faker.date.betweens({
      from: postDate,
      count: commentsCount,
      to: new Date(postDate.getTime() + gapDays * dayMS),
    });
    await db.comment.createMany({
      data: Array.from({ length: commentsCount }).map((_, commentIndex) => ({
        content: faker.lorem.sentences(faker.number.int({ min: 1, max: 3 })),
        authorId: faker.helpers.arrayElement(dbPostViewers).id,
        createdAt: commentDates[commentIndex],
        updatedAt: commentDates[commentIndex],
        postId: dbPost.id,
      })),
    });

    await db.voteOnPost.createMany({
      data: dbPostViewers.map(({ id }) => ({
        isUpvote: faker.helpers.arrayElement([true, false]),
        postId: dbPost.id,
        userId: id,
      })),
    });
  }
}

main()
  .then(async () => {
    await db.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await db.$disconnect();
    process.exit(1);
  });

export const seed = main;

export default main;
