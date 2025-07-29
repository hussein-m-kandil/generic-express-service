import * as Config from '@/lib/config';
import { faker } from '@faker-js/faker';
import bcrypt from 'bcryptjs';
import db from '@/lib/db';

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

const categories = [
  'Open Source',
  'Full Stack',
  'JavaScript',
  'TypeScript',
  'Security',
  'Frontend',
  'Software',
  'Testing',
  'Backend',
];

export async function seed() {
  console.log('Resetting the database...');
  await db.$transaction([
    db.comment.deleteMany({}),
    db.voteOnPost.deleteMany({}),
    db.categoryOnPost.deleteMany({}),
    db.category.deleteMany({}),
    db.post.deleteMany({}),
    db.image.deleteMany({}),
    db.user.deleteMany({}),
  ]);

  console.log('Creating the author account...');
  const dbPostAuthor = await db.user.create({
    data: {
      password: bcrypt.hashSync(AUTHOR_PASSWORD!, Config.SALT),
      bio: 'From Nowhere land with love.',
      username: 'nowhere-man',
      fullname: 'Nowhere-Man',
      isAdmin: true,
    },
  });

  console.log('Creating the viewers accounts...');
  const dbPostViewers = await db.user.createManyAndReturn({
    data: [
      {
        password: bcrypt.hashSync('Ss@12312', Config.SALT),
        fullname: 'Clark Kent / Kal-El',
        bio: 'From Krypton with love.',
        username: 'superman',
        isAdmin: false,
      },
      {
        password: bcrypt.hashSync('Bb@12312', Config.SALT),
        bio: 'From Gotham with love.',
        fullname: 'Bruce Wayne',
        username: 'batman',
        isAdmin: false,
      },
    ],
  });

  console.log('Seeding the database with images...');
  const dbImages = await db.image.createManyAndReturn({
    data: titles.map((_, i) => ({
      width: 1920,
      height: 1080,
      size: 7654321,
      mimetype: 'image/jpeg',
      ownerId: dbPostAuthor.id,
      storageId: crypto.randomUUID(),
      src: `${Config.SUPABASE_BUCKET_URL}/seed/${i}.jpg`,
      storageFullPath: `${Config.STORAGE_ROOT_DIR}/seed/${i}.jpg`,
    })),
  });

  console.log(
    'Seeding the database with posts, categories, comment, and votes...'
  );
  for (let i = 0; i < postCount; i++) {
    const randomCategories = faker.helpers.arrayElements(
      categories,
      faker.number.int({ min: 2, max: 3 })
    );

    // A post every 2 days
    const postDate = faker.date.recent({
      refDate: new Date(Date.now() - 2 * (postCount - i) * 24 * 60 * 60 * 1000),
    });
    const dbPost = await db.post.create({
      data: {
        published: true,
        title: titles[i],
        createdAt: postDate,
        updatedAt: postDate,
        imageId: dbImages[i].id,
        authorId: dbPostAuthor.id,
        content: faker.lorem.paragraphs(faker.number.int({ min: 10, max: 15 })),
        categories: {
          create: randomCategories.map((name) => ({
            category: {
              connectOrCreate: { where: { name }, create: { name } },
            },
          })),
        },
      },
    });

    await db.comment.createMany({
      data: Array.from({
        length: faker.number.int({ min: 2, max: 5 }),
      }).map(() => {
        const commentDate = faker.date.between({
          from: postDate,
          to: new Date(),
        });
        return {
          postId: dbPost.id,
          createdAt: commentDate,
          updatedAt: commentDate,
          authorId: faker.helpers.arrayElement(dbPostViewers).id,
          content: faker.lorem.sentences(faker.number.int({ min: 1, max: 3 })),
        };
      }),
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

seed().catch((error) => {
  console.error(error);
  process.exit(1);
});

export default seed;
