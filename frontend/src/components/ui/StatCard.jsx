"use client";

import Link from "next/link";

/** Kartu KPI: link bila ada `href`; `progress` (0–100) tampil sebagai strip di dasar card. */
export default function StatCard({
  tone = "teal",
  icon,
  label,
  value,
  sub,
  subTitle,
  href,
  progress = null,
}) {
  const pct =
    progress === null || progress === undefined
      ? null
      : Math.min(100, Math.max(0, Math.round(progress)));
  const Tag = href ? Link : "div";
  const tagProps = href ? { href } : {};
  return (
    <Tag {...tagProps} className={`stat-card tone-${tone}`}>
      <span className="stat-icon" aria-hidden="true">
        {icon}
      </span>
      <span className="stat-text">
        <span className="stat-label">{label}</span>
        <span className="stat-value" title={typeof value === "string" ? value : undefined}>
          {value}
        </span>
        <span className="stat-sub" title={subTitle}>
          {sub}
        </span>
      </span>
      {pct !== null && (
        <span className="stat-progress" aria-hidden="true">
          <span className="stat-progress-fill" style={{ width: `${pct}%` }} />
        </span>
      )}
    </Tag>
  );
}
