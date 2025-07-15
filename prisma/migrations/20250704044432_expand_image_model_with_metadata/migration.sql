/*
  Warnings:

  - Added the required column `height` to the `images` table without a default value. This is not possible if the table is not empty.
  - Added the required column `width` to the `images` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "images" ADD COLUMN     "height" INTEGER NOT NULL,
ADD COLUMN     "info" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "scale" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
ADD COLUMN     "width" INTEGER NOT NULL,
ADD COLUMN     "x_pos" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "y_pos" INTEGER NOT NULL DEFAULT 0;
