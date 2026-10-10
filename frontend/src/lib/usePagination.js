"use client";

import { useEffect, useMemo, useState } from "react";
import { DEFAULT_PAGE_SIZE } from "@/components/ui/Pagination";

/** Pagination client-side; kembali ke halaman 1 saat `resetKeys` berubah. */
export function usePagination(items, resetKeys = [], pageSize = DEFAULT_PAGE_SIZE) {
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, resetKeys);

  const totalPages = Math.max(1, Math.ceil((items?.length ?? 0) / pageSize));
  const currentPage = Math.min(Math.max(1, page), totalPages);

  const paginatedItems = useMemo(() => {
    if (!Array.isArray(items)) return [];
    return items.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  }, [items, currentPage, pageSize]);

  const prev = () => setPage((p) => Math.max(1, Math.min(p, totalPages) - 1));
  const next = () => setPage((p) => Math.min(totalPages, Math.min(p, totalPages) + 1));

  return { page: currentPage, totalPages, paginatedItems, prev, next, setPage };
}
