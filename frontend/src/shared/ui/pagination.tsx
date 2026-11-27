import { Pagination as MantinePagination, type PaginationProps } from "@mantine/core";
import { useNarrow } from "./use-narrow";

/** The shared Pagination: controls grow to a thumb-sized target on a phone and wrap onto more lines when they do not fit. */
export function Pagination({ size, ...rest }: PaginationProps) {
  const narrow = useNarrow();
  return <MantinePagination size={size ?? (narrow ? "xl" : "md")} {...rest} />;
}
