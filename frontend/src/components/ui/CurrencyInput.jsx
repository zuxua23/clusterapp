"use client";

import { useRef } from "react";

/** Input nominal dengan titik ribuan; `value`/`onChange` tetap string angka mentah. */
export default function CurrencyInput({ value, onChange, className = "ipl-input", ...rest }) {
  const inputRef = useRef(null);

  const formatted = value ? Number(value).toLocaleString("id-ID") : "";

  const handleChange = (e) => {
    const input = e.target;
    const cursor = input.selectionStart ?? input.value.length;
    const digitsBeforeCursor = input.value.slice(0, cursor).replace(/\D/g, "").length;
    const rawDigits = input.value.replace(/\D/g, "").replace(/^0+(?=\d)/, "");

    onChange(rawDigits);

    requestAnimationFrame(() => {
      if (!inputRef.current) return;
      const newFormatted = rawDigits ? Number(rawDigits).toLocaleString("id-ID") : "";
      let count = 0;
      let pos = newFormatted.length;
      if (digitsBeforeCursor === 0) {
        pos = 0;
      } else {
        for (let i = 0; i < newFormatted.length; i++) {
          if (/\d/.test(newFormatted[i])) count++;
          if (count === digitsBeforeCursor) { pos = i + 1; break; }
        }
      }
      inputRef.current.setSelectionRange(pos, pos);
    });
  };

  return (
    <input
      ref={inputRef}
      type="text"
      inputMode="numeric"
      className={className}
      value={formatted}
      onChange={handleChange}
      {...rest}
    />
  );
}
