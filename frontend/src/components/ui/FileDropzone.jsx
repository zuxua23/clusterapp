"use client";

import { useEffect, useRef, useState } from "react";
import { Upload, Image as ImageIcon, FileText, Trash2 } from "lucide-react";

/** Dropzone upload seragam: gambar tampil sebagai preview, file lain sebagai ikon + nama. */
export default function FileDropzone({
  file,
  onFileSelect,
  onRemove,
  accept,
  maxSizeMB = 10,
  placeholder = "Klik atau seret file ke sini",
  hint,
  currentLabel,
  error,
  onError,
  disabled = false,
}) {
  const [preview, setPreview] = useState(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const inputRef = useRef(null);

  const isImage = file && file.type.startsWith("image/");

  useEffect(() => {
    if (!isImage) { setPreview(null); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file, isImage]);

  const pilihFile = (f) => {
    if (!f) return;
    if (maxSizeMB && f.size > maxSizeMB * 1024 * 1024) {
      onError?.(`Ukuran file maksimal ${maxSizeMB} MB.`);
      return;
    }
    onFileSelect(f);
  };

  const openPicker = () => { if (!disabled) inputRef.current?.click(); };

  return (
    <div>
      <div
        className={`bukti-dropzone ${file ? "has-preview" : ""} ${isDragOver ? "is-dragover" : ""} ${error ? "has-error" : ""}`}
        onClick={openPicker}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragOver(false);
          if (!disabled) pilihFile(e.dataTransfer.files?.[0]);
        }}
        onDragOver={(e) => { e.preventDefault(); if (!disabled) setIsDragOver(true); }}
        onDragLeave={() => setIsDragOver(false)}
        role="button"
        tabIndex={disabled ? -1 : 0}
        onKeyDown={(e) => e.key === "Enter" && openPicker()}
      >
        {file ? (
          <div className="bukti-preview-wrap">
            {isImage ? (
              <img src={preview} alt="Preview file" className="bukti-preview-img" />
            ) : (
              <FileText size={40} strokeWidth={1.2} />
            )}
            <p className="bukti-preview-name">{file.name}</p>
          </div>
        ) : (
          <div className="bukti-drop-placeholder">
            <ImageIcon size={36} strokeWidth={1.2} />
            <p>{currentLabel || placeholder}</p>
            {hint && <span>{hint}</span>}
          </div>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        style={{ display: "none" }}
        onChange={(e) => { pilihFile(e.target.files?.[0]); e.target.value = ""; }}
        disabled={disabled}
      />
      {error && <span className="field-error">{error}</span>}
      {file && (
        <div className="bukti-file-actions">
          <button type="button" className="bukti-ganti-btn" onClick={openPicker} disabled={disabled}>
            <Upload size={14} /> Ganti File
          </button>
          {onRemove && (
            <button
              type="button"
              className="btn-icon danger"
              onClick={onRemove}
              aria-label="Hapus file"
              title="Hapus file"
              disabled={disabled}
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
