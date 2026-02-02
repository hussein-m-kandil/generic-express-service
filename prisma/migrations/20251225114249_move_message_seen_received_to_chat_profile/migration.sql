/*
  Warnings:

  - You are about to drop the `profiles_received_messages` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `profiles_seen_messages` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "profiles_received_messages" DROP CONSTRAINT "profiles_received_messages_message_id_fkey";

-- DropForeignKey
ALTER TABLE "profiles_received_messages" DROP CONSTRAINT "profiles_received_messages_profile_id_fkey";

-- DropForeignKey
ALTER TABLE "profiles_seen_messages" DROP CONSTRAINT "profiles_seen_messages_message_id_fkey";

-- DropForeignKey
ALTER TABLE "profiles_seen_messages" DROP CONSTRAINT "profiles_seen_messages_profile_id_fkey";

-- AlterTable
ALTER TABLE "profiles_chats" ADD COLUMN     "last_received_at" TIMESTAMP(3),
ADD COLUMN     "last_seen_at" TIMESTAMP(3);

-- DropTable
DROP TABLE "profiles_received_messages";

-- DropTable
DROP TABLE "profiles_seen_messages";
