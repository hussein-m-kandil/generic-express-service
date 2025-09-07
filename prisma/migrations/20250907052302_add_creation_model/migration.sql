-- CreateEnum
CREATE TYPE "public"."Model" AS ENUM ('COMMENT', 'IMAGE', 'USER', 'VOTE', 'POST', 'TAG');

-- CreateTable
CREATE TABLE "public"."Creation" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "model" "public"."Model" NOT NULL,
    "username" TEXT NOT NULL,
    "is_admin" BOOLEAN NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Creation_pkey" PRIMARY KEY ("id")
);
