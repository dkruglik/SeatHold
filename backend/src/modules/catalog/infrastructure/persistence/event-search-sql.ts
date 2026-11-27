import { Prisma } from "../../../../generated/prisma/client.js";
import type { EventSearchCriteria } from "../../application/ports/event-search-reader.js";

/** Escapes the characters `ILIKE` treats specially, so user text is matched literally (with `ESCAPE '\'`). */
export const escapeLike = (text: string): string => text.replace(/[\\%_]/g, (c) => `\\${c}`);

/**
 * The WHERE clause over `events e`, `shows sh` and `venues v`. Every value is a bound parameter;
 * only fixed SQL text is concatenated. Absent filters add nothing.
 */
export function buildEventFilters(c: EventSearchCriteria): Prisma.Sql {
  const parts: Prisma.Sql[] = [];
  if (c.q !== undefined) {
    parts.push(Prisma.sql`(sh.search_vector @@ plainto_tsquery('simple', ${c.q}) OR v.name ILIKE ${`%${escapeLike(c.q)}%`} ESCAPE '\\')`);
  }
  if (c.type !== undefined) parts.push(Prisma.sql`sh.type = ${c.type}`);
  if (c.genre !== undefined) parts.push(Prisma.sql`sh.genre = ${c.genre}`);
  if (c.country !== undefined) parts.push(Prisma.sql`v.country_code = ${c.country}`);
  if (c.city !== undefined) parts.push(Prisma.sql`v.city = ${c.city}`);
  if (c.venueId !== undefined) parts.push(Prisma.sql`e.venue_id = ${c.venueId}::uuid`);
  if (c.from !== undefined) parts.push(Prisma.sql`e.starts_at >= ${c.from}::timestamptz`);
  if (c.after !== undefined) parts.push(Prisma.sql`e.starts_at > ${c.after}::timestamptz`);
  if (c.to !== undefined) parts.push(Prisma.sql`e.starts_at <= ${c.to}::timestamptz`);
  return parts.length === 0 ? Prisma.sql`TRUE` : Prisma.join(parts, " AND ");
}
