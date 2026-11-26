-- Search (Phase 3 it-1). Additive only: one generated column and two indexes.

-- Title search: stored generated column, so no trigger and no application write path.
ALTER TABLE "shows" ADD COLUMN "search_vector" tsvector GENERATED ALWAYS AS (to_tsvector('simple', "title")) STORED;

-- CreateIndex
CREATE INDEX "shows_search_vector_idx" ON "shows" USING GIN ("search_vector");

-- CreateIndex
CREATE INDEX "venues_country_code_city_idx" ON "venues"("country_code", "city");
