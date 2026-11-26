import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { patchFilters, readFilters } from "../lib/search-params";
import type { SearchFilters } from "../types";

export type FilterPatch = Parameters<typeof patchFilters>[1];

export interface DiscoveryFilters {
  readonly filters: SearchFilters;
  /** Changes filters; the page resets to 1. */
  readonly setFilters: (patch: FilterPatch, options?: { readonly replace?: boolean }) => void;
  readonly setPage: (page: number) => void;
  readonly clear: () => void;
}

/** All filter state lives in the URL query string; nothing is copied into component state. */
export function useDiscoveryFilters(): DiscoveryFilters {
  const [params, setParams] = useSearchParams();
  const filters = useMemo(() => readFilters(params), [params]);

  const setFilters = useCallback<DiscoveryFilters["setFilters"]>(
    (patch, options) => setParams((current) => patchFilters(current, patch), { replace: options?.replace ?? false }),
    [setParams],
  );
  const setPage = useCallback((page: number) => setParams((current) => patchFilters(current, {}, page)), [setParams]);
  const clear = useCallback(() => setParams(new URLSearchParams()), [setParams]);
  return { filters, setFilters, setPage, clear };
}

/**
 * The free-text box: the typed value is local, and reaches the URL `delayMs` after the last keystroke.
 * A change of `q` that did not come from here (Clear filters, Back) replaces the typed value.
 */
export function useDebouncedQuery(urlValue: string | undefined, commit: (value: string | undefined) => void, delayMs = 300) {
  const committed = useRef(urlValue);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [draft, setDraft] = useState(urlValue ?? "");

  useEffect(() => {
    if (urlValue !== committed.current) {
      committed.current = urlValue;
      clearTimeout(timer.current);
      setDraft(urlValue ?? "");
    }
  }, [urlValue, setDraft]);
  useEffect(() => () => clearTimeout(timer.current), []);

  const onChange = (value: string) => {
    setDraft(value);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const next = value.trim() === "" ? undefined : value.trim();
      committed.current = next;
      commit(next);
    }, delayMs);
  };
  return { value: draft, onChange };
}
