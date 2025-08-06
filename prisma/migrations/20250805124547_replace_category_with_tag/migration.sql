/*
  Warnings:

  - You are about to drop the `categories` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `categories_on_posts` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `votes_on_posts` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "public"."categories_on_posts" DROP CONSTRAINT "categories_on_posts_name_fkey";

-- DropForeignKey
ALTER TABLE "public"."categories_on_posts" DROP CONSTRAINT "categories_on_posts_post_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."votes_on_posts" DROP CONSTRAINT "votes_on_posts_post_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."votes_on_posts" DROP CONSTRAINT "votes_on_posts_user_id_fkey";

-- DropTable
DROP TABLE "public"."categories";

-- DropTable
DROP TABLE "public"."categories_on_posts";

-- DropTable
DROP TABLE "public"."votes_on_posts";

-- CreateTable
CREATE TABLE "public"."tags" (
    "order" SERIAL NOT NULL,
    "name" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "public"."posts_tags" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "post_id" UUID NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "posts_tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."posts_votes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "order" SERIAL NOT NULL,
    "user_id" UUID NOT NULL,
    "post_id" UUID NOT NULL,
    "is_upvote" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "posts_votes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tags_order_key" ON "public"."tags"("order");

-- CreateIndex
CREATE UNIQUE INDEX "tags_name_key" ON "public"."tags"("name");

-- CreateIndex
CREATE UNIQUE INDEX "posts_tags_post_id_name_key" ON "public"."posts_tags"("post_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "posts_votes_order_key" ON "public"."posts_votes"("order");

-- CreateIndex
CREATE UNIQUE INDEX "posts_votes_user_id_post_id_key" ON "public"."posts_votes"("user_id", "post_id");

-- AddForeignKey
ALTER TABLE "public"."posts_tags" ADD CONSTRAINT "posts_tags_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."posts_tags" ADD CONSTRAINT "posts_tags_name_fkey" FOREIGN KEY ("name") REFERENCES "public"."tags"("name") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."posts_votes" ADD CONSTRAINT "posts_votes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."posts_votes" ADD CONSTRAINT "posts_votes_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
