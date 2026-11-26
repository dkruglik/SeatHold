-- Guest access schema (Phase 3 it-3). Additive only: three new tables, no existing table is touched.
-- No timestamp defaults: callers pass the injected `now`.
-- Tokens are never stored, only their SHA-256 hash. The resend limiter stores the SHA-256 of the lower-cased email, never the address.
--
-- Retention: expired, consumed, invalidated and revoked rows are inert (every read checks the time and the flags).
-- Purging old rows, including guest_resend_attempts older than the rate-limit window, belongs to a later sweep job.

-- CreateTable
CREATE TABLE "guest_access_links" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "booking_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "consumed_at" TIMESTAMPTZ(3),
    "invalidated_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "guest_access_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guest_sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "booking_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "guest_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guest_resend_attempts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email_hash" TEXT NOT NULL,
    "attempted_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "guest_resend_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "guest_access_links_token_hash_key" ON "guest_access_links"("token_hash");

-- CreateIndex
CREATE INDEX "guest_access_links_booking_id_idx" ON "guest_access_links"("booking_id");

-- CreateIndex
CREATE UNIQUE INDEX "guest_sessions_token_hash_key" ON "guest_sessions"("token_hash");

-- CreateIndex
CREATE INDEX "guest_sessions_booking_id_idx" ON "guest_sessions"("booking_id");

-- CreateIndex
CREATE INDEX "guest_resend_attempts_email_hash_attempted_at_idx" ON "guest_resend_attempts"("email_hash", "attempted_at");

-- AddForeignKey
ALTER TABLE "guest_access_links" ADD CONSTRAINT "guest_access_links_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guest_sessions" ADD CONSTRAINT "guest_sessions_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
