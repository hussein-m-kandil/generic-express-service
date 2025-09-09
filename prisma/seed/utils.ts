import { tags, usersData, postTitles } from './data';
import { faker } from '@faker-js/faker';

export function createPostsData() {
  let oldestDate = new Date();

  const postsData = postTitles
    .flatMap((title) =>
      faker.datatype.boolean()
        ? [title, faker.lorem.sentence().replace(/\.$/, '')]
        : title
    )
    .map((title) => {
      const authorIndex = faker.number.int(usersData.length - 1);
      const viewerIndexes = usersData
        .map((_, userIndex) => userIndex)
        .filter((userIndex) => userIndex !== authorIndex);

      oldestDate = faker.date.recent({ days: 14, refDate: oldestDate });

      let imagePath: string | undefined;
      const imageIndex = postTitles.findIndex((t) => t === title);
      if (imageIndex > -1) imagePath = `/images/seed/${imageIndex}.jpg`;

      return {
        title,
        imagePath,
        authorIndex,
        viewerIndexes,
        date: oldestDate,
        tags: faker.helpers.arrayElements(tags, { min: 3, max: 7 }),
        content: faker.lorem.paragraphs(faker.number.int({ min: 10, max: 15 })),
        comments: Array.from({ length: faker.number.int({ min: 1, max: 5 }) })
          .map(() => faker.lorem.sentences({ min: 1, max: 3 }))
          .map((content, commentIndex) => ({
            content,
            authorIndex: faker.helpers.arrayElement(viewerIndexes),
            date: new Date(oldestDate.getTime() + (commentIndex + 1) * 1000),
          })),
        votes: viewerIndexes.map((userIndex, voteIndex) => ({
          userIndex,
          isUpVote: faker.datatype.boolean(),
          date: new Date(oldestDate.getTime() + (voteIndex + 1) * 1000),
        })),
      };
    })
    .reverse(); // To be sorted from oldest to newest

  return { postsData, oldestPostDate: oldestDate };
}
