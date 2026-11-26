import type { PrismaService } from "../../../../infrastructure/persistence/prisma-service.js";
import type { FacetsReader, StoredFacets } from "../../application/ports/facets-reader.js";
import { guarded } from "./persistence-errors.js";

/** Two small DISTINCT statements over events that have not started (the same rule as the default search). */
export class PrismaFacetsReader implements FacetsReader {
  constructor(private readonly prisma: PrismaService) {}

  read(now: Date): Promise<StoredFacets> {
    return guarded("read facets", async () => {
      const [showKinds, venues] = await Promise.all([
        this.prisma.client.$queryRaw<{ type: string; genre: string }[]>`
          SELECT DISTINCT sh.type, sh.genre FROM shows sh
          WHERE EXISTS (SELECT 1 FROM events e WHERE e.show_id = sh.id AND e.starts_at > ${now}::timestamptz)`,
        this.prisma.client.$queryRaw<{ id: string; name: string; city: string; country_code: string }[]>`
          SELECT v.id, v.name, v.city, v.country_code FROM venues v
          WHERE EXISTS (SELECT 1 FROM events e WHERE e.venue_id = v.id AND e.starts_at > ${now}::timestamptz)`,
      ]);
      return { showKinds, venues: venues.map((v) => ({ id: v.id, name: v.name, city: v.city, countryCode: v.country_code })) };
    });
  }
}
