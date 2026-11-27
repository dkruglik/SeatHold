/** True when `error` is a PostgreSQL unique violation (SQLSTATE 23505), however Prisma wraps it. */
export function isUniqueViolation(error: unknown): boolean {
  const e = error as { code?: unknown; meta?: { code?: unknown; driverAdapterError?: { cause?: { originalCode?: unknown; kind?: unknown } } } } | null;
  const cause = e?.meta?.driverAdapterError?.cause;
  return e?.code === "P2002" || e?.meta?.code === "23505" || cause?.originalCode === "23505" || cause?.kind === "UniqueConstraintViolation";
}
