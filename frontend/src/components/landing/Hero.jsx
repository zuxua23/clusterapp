export default function Hero() {
  return (
    <section
      id="beranda"
      style={{
        minHeight: "100vh",
        background: "#0F172A",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        paddingTop: 68,
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: "#0D9488" }} />

      {/* Blob gradient melayang pelan di background — cuma transform yang di-animate, murah buat GPU */}
      <div className="lp-hero-blob lp-hero-blob-a" aria-hidden="true" />
      <div className="lp-hero-blob lp-hero-blob-b" aria-hidden="true" />

      <div className="lp-hero-inner" style={{ position: "relative", zIndex: 1, maxWidth: 1200, margin: "0 auto", padding: "72px 48px 56px", width: "100%" }}>
        <div className="lp-hero-grid">
          {/* Kolom kiri - Teks */}
          <div style={{ animation: "lpFadeUp 0.6s ease both" }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: "#0D9488", textTransform: "uppercase", letterSpacing: "0.15em", marginBottom: 20 }}>
              Portal Resmi · RW 21 · Permata Cimanggis · Kota Depok
            </p>
            <h1
              style={{
                fontFamily: "var(--font-jakarta), sans-serif",
                fontSize: "clamp(36px,5vw,58px)",
                fontWeight: 700,
                color: "white",
                lineHeight: 1.12,
                letterSpacing: "-0.02em",
                marginBottom: 20,
              }}
            >
              Portal Digital Kepengurusan
              <br />
              <span style={{ color: "#0D9488" }}>RW Cluster Topaz</span>
            </h1>
            <p style={{ fontSize: 17, color: "#64748B", lineHeight: 1.75, maxWidth: 580, marginBottom: 36 }}>
              Pusat informasi kas, pengumuman resmi, dan layanan administrasi untuk seluruh warga Permata
              Cimanggis Cluster Topaz. Platform ini menggantikan proses administrasi manual yang sebelumnya
              dilakukan melalui WhatsApp.
            </p>
          </div>

          {/* Kolom kanan - Logo Topaz */}
          <div
            className="lp-hero-logo logo-topaz-wrap"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <div className="logo-topaz-glow" aria-hidden="true" />
            <img
              src="/LogoTopaz.svg"
              alt="Logo Cluster Topaz"
              className="logo-topaz"
              style={{
                width: 420,
                height: 420,
                objectFit: "contain",
              }}
            />
          </div>
        </div>
      </div>

    </section>
  );
}
