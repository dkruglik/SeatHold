import type { PrismaService } from "../../../../infrastructure/persistence/prisma-service.js";
import type { AdminLookupsReader, LookupShow, LookupVenue } from "../../application/ports/admin-readers.js";
import { guarded } from "../../../../shared/persistence/guarded.js";

interface VenueRow {
  readonly id: string;
  readonly name: string;
  readonly city: string;
  readonly country_code: string;
  readonly timezone: string;
}

/** Shows and venues for the create-event form: read-only, ordered, each list cut at `limit`. */
export class PrismaAdminLookupsReader implements AdminLookupsReader {
  constructor(private readonly prisma: PrismaService) {}

  load(limit: number): Promise<{ readonly shows: readonly LookupShow[]; readonly venues: readonly LookupVenue[] }> {
    return guarded("load admin lookups", async () => {
      const [shows, venues] = await Promise.all([
        this.prisma.client.$queryRaw<LookupShow[]>`SELECT id, title, type, genre FROM shows ORDER BY title, id LIMIT ${limit}`,
        this.prisma.client.$queryRaw<VenueRow[]>`SELECT id, name, city, country_code, timezone FROM venues ORDER BY name, city, id LIMIT ${limit}`,
      ]);
      return { shows, venues: venues.map((v) => ({ id: v.id, name: v.name, city: v.city, countryCode: v.country_code, timezone: v.timezone })) };
    });
  }
}
