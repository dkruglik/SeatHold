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

export const windowOf = ({ page, pageSize }: PageInput): { offset: number; limit: number } => ({ offset: (page - 1) * pageSize, limit: pageSize });

export const pagedOf = <T>(input: PageInput, rows: readonly T[], total: number): Paged<T> => ({
  items: rows,
  total,
  page: input.page,
  pageSize: input.pageSize,
  totalPages: Math.ceil(total / input.pageSize),
});
