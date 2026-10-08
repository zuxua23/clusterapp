"use client";

import { Children, cloneElement, isValidElement, useCallback, useEffect, useRef, useState } from "react";
import { Filter, ChevronDown } from "lucide-react";
import Select from "./Select";

// Di mobile, semua Select di dalam popover otomatis jadi radio list inline
// (tanpa dropdown-dalam-dropdown). Input lain (month, teks) dibiarkan apa adanya.
function withMobileSelect(children) {
  return Children.map(children, (child) => {
    if (!isValidElement(child)) return child;
    if (child.type !== FilterField) return child;
    return cloneElement(child, {
      children: Children.map(child.props.children, (grand) =>
        isValidElement(grand) && grand.type === Select && grand.props.expandOnMobile === undefined
          ? cloneElement(grand, { expandOnMobile: true })
          : grand,
      ),
    });
  });
}

export default function FilterPopover({
  children,
  active = false,
  activeCount = 0,
  label = "Filter",
  hint,
  open: controlledOpen,
  onOpenChange,
  onOpen,
  onApply,
  onReset,
  applyDisabled = false,
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  // Mode controlled (bila prop open diberikan) atau uncontrolled seperti semula.
  // Pemakaian lama tanpa prop baru tetap berperilaku sama persis.
  const open = controlledOpen ?? internalOpen;

  // Simpan nilai terbaru di ref (disinkronkan lewat effect, bukan saat render)
  // agar setOpen tidak perlu open sebagai dependency, sehingga ukuran deps
  // array useEffect selalu konstan.
  const openRef = useRef(open);
  useEffect(() => {
    openRef.current = open;
  }, [open]);

  const controlledOpenRef = useRef(controlledOpen);
  useEffect(() => {
    controlledOpenRef.current = controlledOpen;
  }, [controlledOpen]);

  const onOpenChangeRef = useRef(onOpenChange);
  useEffect(() => {
    onOpenChangeRef.current = onOpenChange;
  }, [onOpenChange]);

  const setOpen = useCallback((value) => {
    const next = typeof value === "function" ? value(openRef.current) : value;
    if (controlledOpenRef.current === undefined) setInternalOpen(next);
    onOpenChangeRef.current?.(next);
  }, []);

  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e) => {
      // Klik di dalam menu dropdown (portal) milik Select dianggap klik di dalam:
      // pilih opsi tidak ikut menutup popover.
      if (e.target?.closest?.("[data-select-menu]")) return;
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    const onKeyDown = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, setOpen]);

  const handleToggle = () => {
    setOpen((o) => {
      const next = !o;
      if (next) onOpen?.();
      return next;
    });
  };

  const handleApply = () => {
    onApply?.();
    setOpen(false);
  };

  const handleReset = () => {
    onReset?.();
    setOpen(false);
  };

  return (
    <div className="filter-popover" ref={ref}>
      <button
        type="button"
        className={`filter-popover-btn ${active ? "is-active" : ""}`}
        onClick={handleToggle}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <Filter size={15} />
        {label}
        {activeCount > 0 && (
          <span className="filter-popover-count" aria-label={`${activeCount} filter aktif`}>
            {activeCount}
          </span>
        )}
        <ChevronDown size={14} className={`filter-popover-chevron ${open ? "is-open" : ""}`} />
      </button>

      {open && (
        <div className="filter-popover-panel" role="dialog" aria-label={label}>
          <div className="filter-popover-fields">{withMobileSelect(children)}</div>
          <div className="filter-popover-footer">
            <button type="button" className="filter-popover-reset" onClick={handleReset}>
              Reset
            </button>
            <button
              type="button"
              className="filter-popover-apply"
              onClick={handleApply}
              disabled={applyDisabled}
            >
              Terapkan
            </button>
          </div>
          {hint && <p className="filter-popover-hint">{hint}</p>}
        </div>
      )}
    </div>
  );
}

export function FilterField({ label, children }) {
  return (
    <div className="filter-popover-field">
      <label>{label}</label>
      {children}
    </div>
  );
}
