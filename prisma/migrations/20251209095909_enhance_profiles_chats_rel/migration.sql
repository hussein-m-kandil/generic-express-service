/*
  Warnings:

  - A unique constraint covering the columns `[profile_name,chat_id]` on the table `profiles_chats` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `profile_name` to the `profiles_chats` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "profiles_chats" DROP CONSTRAINT "profiles_chats_profile_id_fkey";

-- DropIndex
DROP INDEX "profiles_chats_profile_id_chat_id_key";

-- AlterTable
ALTER TABLE "profiles_chats" ADD COLUMN     "profile_name" TEXT NOT NULL,
ALTER COLUMN "profile_id" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "profiles_chats_profile_name_chat_id_key" ON "profiles_chats"("profile_name", "chat_id");

-- AddForeignKey
ALTER TABLE "profiles_chats" ADD CONSTRAINT "profiles_chats_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
