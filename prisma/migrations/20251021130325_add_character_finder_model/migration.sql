-- CreateTable
CREATE TABLE "character_finder" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Anonymous',
    "duration" INTEGER,

    CONSTRAINT "character_finder_pkey" PRIMARY KEY ("id")
);
