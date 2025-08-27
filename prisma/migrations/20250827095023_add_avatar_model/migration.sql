/*
  Warnings:

  - You are about to drop the column `user_id` on the `images` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "public"."images" DROP CONSTRAINT "images_user_id_fkey";

-- DropIndex
DROP INDEX "public"."images_user_id_key";

-- AlterTable
ALTER TABLE "public"."images" DROP COLUMN "user_id";

-- CreateTable
CREATE TABLE "public"."Avatar" (
    "user_id" UUID NOT NULL,
    "image_id" UUID NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "Avatar_user_id_key" ON "public"."Avatar"("user_id");

-- AddForeignKey
ALTER TABLE "public"."Avatar" ADD CONSTRAINT "Avatar_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Avatar" ADD CONSTRAINT "Avatar_image_id_fkey" FOREIGN KEY ("image_id") REFERENCES "public"."images"("id") ON DELETE CASCADE ON UPDATE CASCADE;
