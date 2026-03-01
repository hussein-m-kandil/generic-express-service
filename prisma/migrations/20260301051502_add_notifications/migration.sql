-- CreateTable
CREATE TABLE "notifications_receivers" (
    "profile_id" UUID NOT NULL,
    "notification_id" UUID NOT NULL,
    "seen_at" TIMESTAMP(3)
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "profile_id" UUID,
    "profile_name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "description" TEXT,
    "header" TEXT NOT NULL,
    "url" TEXT NOT NULL,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "notifications_receivers_profile_id_notification_id_key" ON "notifications_receivers"("profile_id", "notification_id");

-- AddForeignKey
ALTER TABLE "notifications_receivers" ADD CONSTRAINT "notifications_receivers_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications_receivers" ADD CONSTRAINT "notifications_receivers_notification_id_fkey" FOREIGN KEY ("notification_id") REFERENCES "notifications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
