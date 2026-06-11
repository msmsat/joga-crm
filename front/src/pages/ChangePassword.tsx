import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import "../App.css"; 
import { Orbs, Logo, InputField, PrimaryBtn, PasswordStrength, ErrorAlert } from "../components/UI";

export default function ChangePassword() {
  const navigate = useNavigate();
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(false);
  
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  
  const [errors, setErrors] = useState<{ current?: string; new?: string; confirm?: string }>({});
  const [submitError, setSubmitError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  useEffect(() => {
    setTimeout(() => setMounted(true), 50);
  }, []);

  const validateForm = () => {
    const newErrors: any = {};
    if (!currentPassword) newErrors.current = "Введите текущий пароль";
    if (!newPassword || newPassword.length < 8) newErrors.new = "Минимум 8 символов";
    if (newPassword !== confirmPassword) newErrors.confirm = "Пароли не совпадают";
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;
    setLoading(true);
    setSubmitError("");
    setSuccessMsg("");

    try {
      // Здесь будет твой реальный API запрос
      // await fetch("...", { method: "POST", body: JSON.stringify({ currentPassword, newPassword }) });
      
      // Имитация загрузки
      await new Promise(res => setTimeout(res, 1200));
      
      setSuccessMsg("Пароль успешно обновлен! Все ваши сессии надежно защищены.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      
      // Через 2 секунды возвращаем пользователя обратно в настройки
      setTimeout(() => navigate("/dashboard"), 2500);
      
    } catch (err: any) {
      setSubmitError(err.message || "Ошибка при смене пароля");
    } finally {
      setLoading(false);
    }
  };

  // Общая иконка для полей пароля
  const lockIcon = (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="3" y="7" width="10" height="7.5" rx="2" stroke="currentColor" strokeWidth="1.4" />
      <path d="M5.5 7V5C5.5 3.61929 6.61929 2.5 8 2.5C9.38071 2.5 10.5 3.61929 10.5 5V7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="8" cy="10.5" r="1" fill="currentColor" />
    </svg>
  );

  const toggleVisibilityBtn = (
    <button
      onClick={() => setShowPassword(!showPassword)}
      style={{
        background: "none", border: "none", cursor: "pointer",
        color: showPassword ? "var(--peach)" : "var(--muted)",
        padding: 0, height: "100%", display: "flex", 
        alignItems: "center", justifyContent: "center", 
        transition: "color 0.2s", outline: "none", fontSize: "12px", fontWeight: 600
      }}
    >
      {showPassword ? "Скрыть" : "Показать"}
    </button>
  );

  return (
    <div className="page-wrapper">
      <Orbs />

      {/* ── TOP NAV ── */}
      <nav style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "20px 40px", position: "relative", zIndex: 10,
        opacity: mounted ? 1 : 0, transition: "opacity 0.4s ease",
      }}>
        <Logo />
        <button
          onClick={() => navigate(-1)} // Возвращает на предыдущую страницу
          style={{
            display: "flex", alignItems: "center", gap: "6px",
            background: "rgba(26,26,26,0.04)", border: "1px solid rgba(26,26,26,0.05)", 
            color: "var(--onyx)", fontWeight: 700, fontSize: "12px", 
            cursor: "pointer", padding: "8px 16px", borderRadius: "100px",
            transition: "all 0.2s ease"
          }}
          onMouseEnter={e => { e.currentTarget.style.background = "var(--peach)"; e.currentTarget.style.color = "white"; e.currentTarget.style.borderColor = "var(--peach)"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "rgba(26,26,26,0.04)"; e.currentTarget.style.color = "var(--onyx)"; e.currentTarget.style.borderColor = "rgba(26,26,26,0.05)"; }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
          Вернуться в настройки
        </button>
      </nav>

      {/* ── MAIN CONTENT ── */}
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px 24px 60px", position: "relative", zIndex: 1 }}>
        <div style={{
          width: "100%", maxWidth: "440px",
          opacity: mounted ? 1 : 0, transform: mounted ? "translateY(0)" : "translateY(24px)",
          transition: "all 0.55s cubic-bezier(0.34,1.1,0.64,1) 0.1s",
        }}>
          <div className="login-card">
            
            {/* Header */}
            <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginBottom: "8px" }}>
              <div style={{ width: "48px", height: "48px", borderRadius: "14px", background: "rgba(252,174,145,0.12)", color: "var(--peach)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "8px" }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
              </div>
              <h1 style={{ fontSize: "26px", fontWeight: 900, color: "var(--onyx)", letterSpacing: "-0.8px", margin: 0 }}>
                Смена пароля
              </h1>
              <p style={{ fontSize: "14px", color: "var(--muted)", margin: 0, fontWeight: 400, lineHeight: "1.5" }}>
                Придумайте надежный пароль. Мы рекомендуем использовать буквы разного регистра, цифры и спецсимволы.
              </p>
            </div>

            {/* Form Fields */}
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <ErrorAlert message={submitError} />
              
              {successMsg && (
                <div style={{ padding: "12px 16px", background: "#E8F5E9", border: "1px solid #A5D6A7", borderRadius: "10px", color: "#2E7D32", fontSize: "13px", fontWeight: 600 }}>
                  {successMsg}
                </div>
              )}

              <InputField
                label="Текущий пароль" type={showPassword ? "text" : "password"} placeholder="Введите текущий пароль"
                value={currentPassword} onChange={(v: string) => { setCurrentPassword(v); setErrors(e => ({ ...e, current: undefined })); }}
                icon={lockIcon} rightSlot={toggleVisibilityBtn} error={errors.current}
              />

              <div style={{ width: "100%", height: "1px", background: "var(--border)", margin: "4px 0" }} />

              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <InputField
                  label="Новый пароль" type={showPassword ? "text" : "password"} placeholder="Минимум 8 символов"
                  value={newPassword} onChange={(v: string) => { setNewPassword(v); setErrors(e => ({ ...e, new: undefined })); }}
                  icon={lockIcon} error={errors.new}
                />
                {newPassword.length > 0 && <PasswordStrength password={newPassword} />}
              </div>

              <InputField
                label="Повторите пароль" type={showPassword ? "text" : "password"} placeholder="Пароли должны совпадать"
                value={confirmPassword} onChange={(v: string) => { setConfirmPassword(v); setErrors(e => ({ ...e, confirm: undefined })); }}
                icon={lockIcon} error={errors.confirm}
              />
            </div>

            <PrimaryBtn onClick={handleSubmit} loading={loading} fullWidth>
              Обновить пароль
            </PrimaryBtn>
            
          </div>
        </div>
      </div>
      
      {/* ── FOOTER ── */}
      <footer style={{ borderTop: `1px solid var(--border)`, padding: "16px 40px", display: "flex", alignItems: "center", justifyContent: "space-between", position: "relative", zIndex: 1, flexWrap: "wrap", gap: "8px" }}>
        <div style={{ fontSize: "12px", color: "rgba(102,102,102,0.5)" }}>© 2026 Velora. Все права защищены.</div>
      </footer>
    </div>
  );
}