"use client";

import { TrendingUp } from "lucide-react";
import { formatRupiah } from "./format";

/** Grafik setoran IPL ke RW; jumlah bar mengikuti range terpilih. */
export default function TrenSetoranChart({ tren, periodeLabel }) {
  if (!tren || tren.length === 0) return null;
  const max = Math.max(...tren.map((t) => t.diterima), 1);
  return (
    <div className="content-card db-chart-card">
      <div className="db-section-header">
        <TrendingUp size={17} />
        <h3>Tren setoran IPL ke RW</h3>
        {periodeLabel && <span className="db-section-sub">{periodeLabel}</span>}
      </div>
      <p
        className="rw-chart-hint"
        title="Dikelompokkan per periode tagihan. Untuk arus kas per tanggal transaksi, lihat menu Keuangan."
      >
        Per periode tagihan · lihat Keuangan untuk per tanggal transaksi
      </p>
      <div className="db-chart-wrap">
        <div className="db-chart-bars">
          {tren.map((t, i) => {
            const pct = max > 0 ? (t.diterima / max) * 100 : 0;
            const isLast = i === tren.length - 1;
            return (
              <div
                key={t.ym}
                className="db-chart-col"
                title={`${t.label}: ${formatRupiah(t.diterima)}${t.berjalan ? " (berjalan)" : ""}`}
              >
                <div className="db-bar-wrapper">
                  <div
                    className={`db-bar ${isLast ? "db-bar-active" : ""}`}
                    style={{ height: `${Math.max(pct, 4)}%` }}
                  />
                </div>
                <span className="db-chart-label">
                  {t.label}
                  {t.berjalan ? " · berjalan" : ""}
                </span>
              </div>
            );
          })}
        </div>
      </div>
      <div className="db-chart-legend">
        {tren.map((t) => (
          <div key={t.ym} className="db-legend-item">
            <span className="db-legend-label">{t.label}</span>
            <span className="db-legend-value">{formatRupiah(t.diterima)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
