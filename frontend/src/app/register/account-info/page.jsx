"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Lock, Eye, EyeOff } from "lucide-react";
import AuthShell from "@/components/auth/AuthShell";
import RegisterStepper from "@/components/auth/RegisterStepper";
import { showMessage } from "@/lib/message";
import { wargaApi } from "@/lib/api";
import { PASSWORD_MIN, isValidPassword } from "@/lib/validators";

export default function AkunPage() {
  const router = useRouter();
  const [dataDiri, setDataDiri] = useState(null);

  const [accountData, setAccountData] = useState({
    password: "",
    confirmPassword: "",
  });

  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  useEffect(() => {
    const storedValue = sessionStorage.getItem("registerDataDiri");
    if (!storedValue) {
      router.replace("/register");
      return;
    }
    setDataDiri(JSON.parse(storedValue));
  }, [router]);

  const handleChange = (event) => {
    setAccountData((prev) => ({ ...prev, [event.target.name]: event.target.value }));
  };

  const handleBack = () => {
    router.push("/register");
  };

  const handleFinish = async (event) => {
    event.preventDefault();

    if (!dataDiri) {
      showMessage("Data Tidak Lengkap", "Data diri belum ditemukan. Silakan ulangi registrasi.", "error")
        .then(() => router.push("/register"));
      return;
    }

    if (!isValidPassword(accountData.password)) {
      showMessage("Kata Sandi Terlalu Pendek", `Kata sandi minimal ${PASSWORD_MIN} karakter.`, "warning");
      return;
    }
    if (accountData.password !== accountData.confirmPassword) {
      showMessage("Kata Sandi Tidak Cocok", "Kata sandi dan konfirmasi tidak cocok.", "warning");
      return;
    }

    setIsLoading(true);
    try {
      const res = await wargaApi.daftarMandiri({
        namaUser: dataDiri.namaUser,
        noTelp: dataDiri.noTelp,
        rt: dataDiri.rt,
        rumahId: Number(dataDiri.rumahId),
        password: accountData.password,
      });

      sessionStorage.removeItem("registerDataDiri");
      await showMessage(
        "Pendaftaran Terkirim",
        res.message || "Pendaftaran kamu menunggu persetujuan pengurus RT. Kamu akan bisa masuk setelah disetujui.",
        "success",
      );
      router.push("/login");
    } catch (error) {
      showMessage("Pendaftaran Gagal", error.message, "error");
    } finally {
      setIsLoading(false);
    }
  };

  const isFinishDisabled = !accountData.password.trim() || !accountData.confirmPassword.trim();

  if (!dataDiri) {
    return (
      <div className="register-container">
        <div className="loading-card">Memuat data pendaftaran...</div>
      </div>
    );
  }

  return (
    <AuthShell
      left={<img src="/LogoTopaz.svg" alt="Topaz Cluster Logo" className="auth-logo" />}
      title="Daftar Akun"
      subtitle="Bergabung dengan portal warga Cluster Topaz"
    >
      <div className="register-content-split">
        <RegisterStepper activeStep={2} />

        <div className="form-box">
          <div className="form-box-header">Buat Akun</div>

          <div className="form-box-body">
            <form>
              <div className="form-group">
                <label htmlFor="password">
                  Kata Sandi <span className="required-star">*</span>
                </label>
                <div className="input-wrapper">
                  <Lock className="input-icon" />
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    name="password"
                    className="form-control with-icon with-toggle"
                    value={accountData.password}
                    onChange={handleChange}
                    minLength={PASSWORD_MIN}
                  />
                  <button
                    type="button"
                    className="password-toggle"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"}
                    aria-pressed={showPassword}
                    title={showPassword ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"}
                  >
                    {showPassword ? <EyeOff /> : <Eye />}
                  </button>
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="confirmPassword">
                  Konfirmasi Kata Sandi <span className="required-star">*</span>
                </label>
                <div className="input-wrapper">
                  <Lock className="input-icon" />
                  <input
                    id="confirmPassword"
                    type={showConfirmPassword ? "text" : "password"}
                    name="confirmPassword"
                    className="form-control with-icon with-toggle"
                    value={accountData.confirmPassword}
                    onChange={handleChange}
                  />
                  <button
                    type="button"
                    className="password-toggle"
                    onClick={() => setShowConfirmPassword((v) => !v)}
                    aria-label={showConfirmPassword ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"}
                    aria-pressed={showConfirmPassword}
                    title={showConfirmPassword ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"}
                  >
                    {showConfirmPassword ? <EyeOff /> : <Eye />}
                  </button>
                </div>
              </div>

              <p className="field-hint">
                Pendaftaran akan masuk status <strong>Menunggu Persetujuan</strong> pengurus RT
                sebelum kamu bisa masuk.
              </p>

              <div className="form-actions">
                <button type="button" className="btn-back" onClick={handleBack}>
                  Kembali
                </button>
                <button
                  type="button"
                  className="btn-next"
                  onClick={handleFinish}
                  disabled={isFinishDisabled || isLoading}
                >
                  {isLoading ? "Mendaftar..." : "Daftar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </AuthShell>
  );
}
