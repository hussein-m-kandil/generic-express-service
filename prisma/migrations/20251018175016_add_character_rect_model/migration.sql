-- CreateTable
CREATE TABLE "character_rect" (
    "name" TEXT NOT NULL,
    "left" INTEGER NOT NULL,
    "top" INTEGER NOT NULL,
    "right" INTEGER NOT NULL,
    "bottom" INTEGER NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "character_rect_name_key" ON "character_rect"("name");
