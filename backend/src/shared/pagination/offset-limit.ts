import { ValidationError } from "../errors/app-error.js";

/**
 * Bounds the row offset `(page - 1) * pageSize` of a paged read: an offset at or past `offsetLimit` is rejected,
 * because the database still walks every skipped row. Page 1 (offset 0) always passes.
 */
export function assertOffsetWithinLimit(page: number, pageSize: number, offsetLimit: number): void {
  if ((page - 1) * pageSize >= offsetLimit) {
    throw new ValidationError(`The page is too deep to list; narrow the filters to reach those results (at most ${String(offsetLimit)} results can be paged through)`, {
      publicCode: "PAGE_TOO_DEEP",
    });
  }
}
