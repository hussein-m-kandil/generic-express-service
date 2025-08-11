/*
  Warnings:

  - You are about to drop the column `author_id` on the `images` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[user_id]` on the table `images` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `owner_id` to the `images` table without a default value. This is not possible if the table is not empty.
  - Made the column `bio` on table `users` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "public"."images" DROP CONSTRAINT "images_author_id_fkey";

-- AlterTable
ALTER TABLE "public"."images" DROP COLUMN "author_id",
ADD COLUMN     "owner_id" UUID NOT NULL,
ADD COLUMN     "user_id" UUID;

-- AlterTable
ALTER TABLE "public"."users" ALTER COLUMN "bio" SET NOT NULL,
ALTER COLUMN "bio" SET DEFAULT '';

-- CreateIndex
CREATE UNIQUE INDEX "images_user_id_key" ON "public"."images"("user_id");

-- AddForeignKey
ALTER TABLE "public"."images" ADD CONSTRAINT "images_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."images" ADD CONSTRAINT "images_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
