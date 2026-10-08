"use client";

import { useEffect, useMemo, useState } from "react";
import { DEFAULT_PAGE_SIZE } from "@/components/ui/Pagination";

/**
 * Hook pagination client-side: 10 data per halaman.
 * Otomatis reset ke halaman 1 setiap `resetKeys` (search/filter) berubah
 * dan menjepit halaman aktif bila total data menyusut.
 */
export function usePagination(items, resetKeys = [], pageSize = DEFAULT_PAGE_SIZE) {
  const [page, setPage] = useState(1);

  // Reset ke halaman pertama saat filter/pencarian berubah
  // (pola yang sama dipakai PublikasiManager untuk PAGE_SIZE 10).
  // resetKeys datang dari parameter (bukan array literal di tempat), jadi ESLint
  // tidak bisa memverifikasi isinya secara statis — tapi React tetap membandingkan
  // tiap elemennya per-render seperti biasa, jadi perilakunya tetap benar.
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
