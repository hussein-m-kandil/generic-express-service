/*
  Warnings:

  - You are about to drop the column `category_name` on the `categories_on_posts` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[post_id,name]` on the table `categories_on_posts` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `name` to the `categories_on_posts` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "categories_on_posts" DROP CONSTRAINT "categories_on_posts_category_name_fkey";

-- DropIndex
DROP INDEX "categories_on_posts_post_id_category_name_key";

-- AlterTable
ALTER TABLE "categories_on_posts" DROP COLUMN "category_name",
ADD COLUMN     "name" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "categories_on_posts_post_id_name_key" ON "categories_on_posts"("post_id", "name");

-- AddForeignKey
ALTER TABLE "categories_on_posts" ADD CONSTRAINT "categories_on_posts_name_fkey" FOREIGN KEY ("name") REFERENCES "categories"("name") ON DELETE CASCADE ON UPDATE CASCADE;
