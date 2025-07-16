/*
  Warnings:

  - A unique constraint covering the columns `[order]` on the table `categories` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[order]` on the table `comments` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[order]` on the table `images` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[order]` on the table `posts` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[order]` on the table `users` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[order]` on the table `votes_on_posts` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "categories" ADD COLUMN     "order" SERIAL NOT NULL;

-- AlterTable
ALTER TABLE "comments" ADD COLUMN     "order" SERIAL NOT NULL;

-- AlterTable
ALTER TABLE "images" ADD COLUMN     "order" SERIAL NOT NULL;

-- AlterTable
ALTER TABLE "posts" ADD COLUMN     "order" SERIAL NOT NULL;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "order" SERIAL NOT NULL;

-- AlterTable
ALTER TABLE "votes_on_posts" ADD COLUMN     "order" SERIAL NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "categories_order_key" ON "categories"("order");

-- CreateIndex
CREATE UNIQUE INDEX "comments_order_key" ON "comments"("order");

-- CreateIndex
CREATE UNIQUE INDEX "images_order_key" ON "images"("order");

-- CreateIndex
CREATE UNIQUE INDEX "posts_order_key" ON "posts"("order");

-- CreateIndex
CREATE UNIQUE INDEX "users_order_key" ON "users"("order");

-- CreateIndex
CREATE UNIQUE INDEX "votes_on_posts_order_key" ON "votes_on_posts"("order");
