import { assertOffsetWithinLimit, reachablePages } from "../../../shared/pagination/offset-limit.js";

export interface PageInput {
  readonly page: number;
  readonly pageSize: number;
}

export interface Paged<T> {
  readonly items: readonly T[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  readonly totalPages: number;
}

/** Offsets the admin lists page through: events like the public search, tickets up to the largest grid (MAX_SEATS). */
export const EVENT_LIST_OFFSET_LIMIT = 10_000;
export const TICKET_LIST_OFFSET_LIMIT = 20_000;

/** The row window of a page; rejects an offset at or past `offsetLimit`. */
export const windowOf = ({ page, pageSize }: PageInput, offsetLimit: number): { offset: number; limit: number } => {
  assertOffsetWithinLimit(page, pageSize, offsetLimit);
  return { offset: (page - 1) * pageSize, limit: pageSize };
};

/** The page answer: `total` is the real count, `totalPages` stops at the last page `windowOf` accepts. */
export const pagedOf = <T>(input: PageInput, rows: readonly T[], total: number, offsetLimit: number): Paged<T> => ({
  items: rows,
  total,
  page: input.page,
  pageSize: input.pageSize,
  totalPages: reachablePages(total, input.pageSize, offsetLimit),
});
