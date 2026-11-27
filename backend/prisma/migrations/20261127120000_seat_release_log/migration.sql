-- Seat release log (Phase 4 it-6). Additive only: one new table, no existing table is touched.
-- No timestamp default: the caller passes the injected `now`.
--
-- One row per manual release of a held seat by an operator, written in the same transaction as the release.
-- `hold_id` is the hold the seat was taken from; `reason` is the operator's free text (never logged by the application).
--
-- Retention: the rows are an audit trail, so they are kept. Growth is one row per manual release, which is a rare
-- operator action; no purge job is planned. Foreign keys are ON DELETE RESTRICT, so a seat, event, hold or admin
-- user that has a log row cannot be deleted by accident.

-- CreateTable
CREATE TABLE "seat_release_log" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "seat_id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "hold_id" UUID,
    "admin_user_id" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "seat_release_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "seat_release_log_seat_id_idx" ON "seat_release_log"("seat_id");

-- CreateIndex
CREATE INDEX "seat_release_log_event_id_created_at_idx" ON "seat_release_log"("event_id", "created_at");

-- AddForeignKey
ALTER TABLE "seat_release_log" ADD CONSTRAINT "seat_release_log_seat_id_fkey" FOREIGN KEY ("seat_id") REFERENCES "seats"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seat_release_log" ADD CONSTRAINT "seat_release_log_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seat_release_log" ADD CONSTRAINT "seat_release_log_hold_id_fkey" FOREIGN KEY ("hold_id") REFERENCES "holds"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seat_release_log" ADD CONSTRAINT "seat_release_log_admin_user_id_fkey" FOREIGN KEY ("admin_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Constraints Prisma cannot express
ALTER TABLE "seat_release_log" ADD CONSTRAINT "seat_release_log_reason_check" CHECK (char_length("reason") BETWEEN 3 AND 500);
