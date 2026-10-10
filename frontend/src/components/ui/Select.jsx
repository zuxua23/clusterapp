"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";

const MOBILE_QUERY = "(max-width: 767px)";
const MENU_MAX_HEIGHT = 280;
const MENU_GAP = 4;

function useIsMobile() {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(MOBILE_QUERY);
    const update = () => setMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return mobile;
}

/** Dropdown custom: desktop lewat portal (tidak kepotong overflow), mobile + expandOnMobile jadi radio list inline. */
export default function Select({
  id,
  name,
  value,
  onChange,
  options = [],
  placeholder,
  disabled = false,
  className = "",
  expandOnMobile = false,
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null); // { top, left, width } dalam viewport
  const [focusIdx, setFocusIdx] = useState(-1);
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const menuRef = useRef(null);
  const listId = useId();
  const isMobile = useIsMobile();
  const inlineList = expandOnMobile && isMobile;

  const selectedIndex = options.findIndex((o) => String(o.value) === String(value));
  const selected = selectedIndex >= 0 ? options[selectedIndex] : null;

  const computePos = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { top: r.bottom + MENU_GAP, left: r.left, width: r.width };
  }, []);

  const buka = useCallback(() => {
    if (disabled) return;
    setPos(computePos());
    setFocusIdx(selectedIndex >= 0 ? selectedIndex : 0);
    setOpen(true);
  }, [computePos, disabled, selectedIndex]);

  const tutup = useCallback((refocus = false) => {
    setOpen(false);
    setPos(null);
    setFocusIdx(-1);
    if (refocus) triggerRef.current?.focus();
  }, []);

  const pilih = useCallback(
    (opt) => {
      onChange?.(opt.value);
      tutup(true);
    },
    [onChange, tutup],
  );

  // Flip ke atas + clamp horizontal setelah menu terukur.
  useEffect(() => {
    if (!open || inlineList || !menuRef.current || !pos) return;
    const h = Math.min(menuRef.current.scrollHeight, MENU_MAX_HEIGHT);
    let { top, left, width } = pos;
    if (top + h > window.innerHeight - 8) {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (rect) {
        const atas = rect.top - h - MENU_GAP;
        // Pakai sisi yang ruangnya lebih besar.
        if (atas >= 8 || atas > window.innerHeight - rect.bottom) {
          top = Math.max(8, atas);
        } else {
          top = Math.max(8, window.innerHeight - 8 - h);
        }
      }
    }
    left = Math.min(Math.max(8, left), Math.max(8, window.innerWidth - width - 8));
    if (top !== pos.top || left !== pos.left) setPos({ top, left, width });
  }, [open, inlineList, pos]);

  // Tutup saat klik di luar; reposisi saat scroll/resize (menu fixed).
  // Esc ditangani di fase capture + stopPropagation supaya popover/modal
  // induk tidak ikut tertutup (menu dulu, popover kemudian).
  useEffect(() => {
    if (!open || inlineList) return;
    const onPointerDown = (e) => {
      if (menuRef.current?.contains(e.target)) return;
      if (rootRef.current?.contains(e.target)) return;
      tutup(false);
    };
    const onKeyDown = (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        tutup(true);
      }
    };
    const onReposition = () => {
      const next = computePos();
      if (next) setPos(next);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("resize", onReposition);
    window.addEventListener("scroll", onReposition, true);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("resize", onReposition);
      window.removeEventListener("scroll", onReposition, true);
    };
  }, [open, inlineList, computePos, tutup]);

  // Fokus ke opsi terpilih saat menu dibuka (navigasi keyboard).
  useEffect(() => {
    if (!open || inlineList) return;
    const t = setTimeout(() => {
      menuRef.current?.querySelector('[role="option"]')?.focus();
    }, 0);
    return () => clearTimeout(t);
  }, [open, inlineList]);

  const onTriggerKeyDown = (e) => {
    if (disabled) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) buka();
    }
  };

  const gerakFokus = (delta) => {
    if (!options.length) return;
    const next = (focusIdx + delta + options.length) % options.length;
    setFocusIdx(next);
    menuRef.current
      ?.querySelector(`[data-idx="${next}"]`)
      ?.focus();
  };

  const onMenuKeyDown = (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      gerakFokus(1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      gerakFokus(-1);
    } else if (e.key === "Home") {
      e.preventDefault();
      setFocusIdx(0);
      menuRef.current?.querySelector('[data-idx="0"]')?.focus();
    } else if (e.key === "End") {
      e.preventDefault();
      const last = options.length - 1;
      setFocusIdx(last);
      menuRef.current?.querySelector(`[data-idx="${last}"]`)?.focus();
    }
  };

  // Mode mobile: radio list inline, tanpa dropdown.
  if (inlineList) {
    return (
      <div
        className={`combobox-radio-list ${className}`}
        role="radiogroup"
        aria-label={placeholder ?? "Pilihan"}
      >
        {options.map((opt) => {
          const aktif = String(opt.value) === String(value);
          return (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={aktif}
              disabled={disabled}
              className={`combobox-radio ${aktif ? "is-selected" : ""}`}
              onClick={() => onChange?.(opt.value)}
            >
              <span className="combobox-radio-label">{opt.label}</span>
              <span className="combobox-check" aria-hidden="true">
                {aktif && <Check size={18} />}
              </span>
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className="combobox" ref={rootRef}>
      <button
        type="button"
        id={id}
        ref={triggerRef}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        className={`form-control custom-select ui-select-trigger ${open ? "combobox-input-open" : ""} ${className}`}
        onClick={() => (open ? tutup(false) : buka())}
        onKeyDown={onTriggerKeyDown}
      >
        <span className={selected ? "" : "is-placeholder"}>
          {selected ? selected.label : (placeholder ?? "")}
        </span>
        <ChevronDown size={16} className="ui-select-chevron" aria-hidden="true" />
      </button>
      {name ? <input type="hidden" name={name} value={value ?? ""} /> : null}
      {open &&
        pos &&
        createPortal(
          <ul
            id={listId}
            ref={menuRef}
            role="listbox"
            aria-label={placeholder ?? "Pilihan"}
            data-select-menu
            className="combobox-list combobox-list-portal"
            style={{ top: pos.top, left: pos.left, minWidth: pos.width }}
            onKeyDown={onMenuKeyDown}
          >
            {options.map((opt, i) => {
              const aktif = String(opt.value) === String(value);
              return (
                <li
                  key={`${opt.value}-${i}`}
                  data-idx={i}
                  role="option"
                  aria-selected={aktif}
                  tabIndex={-1}
                  className={`combobox-option ${aktif ? "is-selected" : ""}`}
                  onClick={() => pilih(opt)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      pilih(opt);
                    }
                  }}
                  onMouseEnter={() => setFocusIdx(i)}
                >
                  <span className="combobox-option-label">{opt.label}</span>
                  <span className="combobox-check" aria-hidden="true">
                    {aktif && <Check size={16} />}
                  </span>
                </li>
              );
            })}
          </ul>,
          document.body,
        )}
    </div>
  );
}
