import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import "../App.css";
import { Orbs, Logo, InputField, PrimaryBtn, PasswordStrength, ErrorAlert } from "../components/UI";
import { authApi, ApiError } from "../api";
import { resolveImageUrl } from "../api/client";
import type { InviteInfo, UserMe } from "../api/auth/auth.types";

// Уход на форму входа именно с ?switch=1: без него PublicRoute уводит на
// дашборд, если в браузере уже открыт чей-то аккаунт — а по ссылке-приглашению
// человек как раз чаще всего приходит в чужую сессию.
const LOGIN = "/login?switch=1";

// Инициалы студии для карточки без лого — как в LinkedAccounts / SelectCrm.
function initials(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() ?? "").join("");
}

// Базовые требования бэкенда (validate_strong_password): гасим самые частые
// промахи до запроса. Остальные его правила — повторы и «123qwe» — остаются за
// сервером: он авторитет, а его текст ошибки страница и так показывает.
function looksStrong(pw: string): boolean {
  return pw.length >= 8 && /[A-Za-zА-Яа-я]/.test(pw) && /[0-9]/.test(pw);
}

const ICON_LOCK = (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <rect x="3" y="7" width="10" height="7.5" rx="2" stroke="currentColor" strokeWidth="1.4" />
    <path d="M5.5 7V5C5.5 3.61929 6.61929 2.5 8 2.5C9.38071 2.5 10.5 3.61929 10.5 5V7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    <circle cx="8" cy="10.5" r="1" fill="currentColor" />
  </svg>
);

export default function JoinPage() {
  const navigate = useNavigate();
  const { t } = useTranslation(["join", "staff"]);
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [invite, setInvite] = useState<InviteInfo | null>(null);
  const [loadError, setLoadError] = useState("");
  // Токен приходит из URL и в течение жизни страницы не меняется, поэтому «нет
  // токена» — это начальное состояние, а не результат загрузки.
  const [loading, setLoading] = useState(Boolean(token));
  const [mounted, setMounted] = useState(false);

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [fieldError, setFieldError] = useState<{ password?: string; confirm?: string }>({});
  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Кто уже сидит в этом браузере. Токен НЕ трогаем, пока приглашение не принято:
  // человек мог открыть ссылку из чужой вкладки и передумать.
  const [currentUser, setCurrentUser] = useState<UserMe | null>(null);

  useEffect(() => { setTimeout(() => setMounted(true), 50); }, []);

  useEffect(() => {
    if (!token) return;
    authApi.getInvite(token)
      .then(setInvite)
      .catch((err: unknown) => setLoadError(err instanceof ApiError ? err.message : t("join:errors.network")))
      .finally(() => setLoading(false));
  }, [token, t]);

  useEffect(() => {
    if (!localStorage.getItem("token")) return;
    authApi.getMe().then(setCurrentUser).catch(() => setCurrentUser(null));
  }, []);

  const needsPassword = invite?.needs_password ?? false;
  // Приглашение адресовано другому аккаунту, а в браузере открыт этот — предупреждаем
  // заранее: принятие заменит активную сессию (переключение аккаунта).
  const otherAccount = currentUser && invite && currentUser.email !== invite.email ? currentUser : null;

  const validate = () => {
    const errs: { password?: string; confirm?: string } = {};
    if (!password) errs.password = t("join:errors.passwordRequired");
    else if (needsPassword && !looksStrong(password)) errs.password = t("join:errors.passwordWeak");
    if (needsPassword && confirm !== password) errs.confirm = t("join:errors.confirmMismatch");
    setFieldError(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate() || submitting) return;
    setSubmitting(true);
    setSubmitError("");
    try {
      const data = await authApi.acceptInvite({ token, password });
      if (data.two_fa_required) {
        // У аккаунта включена 2FA — код уже отправлен, добиваем вход обычной формой.
        navigate(LOGIN);
        return;
      }
      if (data.access_token) {
        localStorage.setItem("token", data.access_token);
        navigate("/dashboard");
      }
    } catch (err: unknown) {
      setSubmitError(err instanceof ApiError ? err.message : t("join:errors.network"));
    } finally {
      setSubmitting(false);
    }
  };

  const logoSrc = resolveImageUrl(invite?.studio_logo_url);
  const roleLabel = invite ? t(`staff:roles.${invite.role}`, { defaultValue: invite.role }) : "";

  return (
    <div className="page-wrapper">
      <Orbs />

      <nav style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 40px", position: "relative", zIndex: 10, opacity: mounted ? 1 : 0, transition: "opacity 0.4s ease" }}>
        <Logo />
        <div style={{ fontSize: "13px", color: "var(--muted)", display: "flex", alignItems: "center", gap: "6px" }}>
          {t("join:nav.question")}{" "}
          <button
            onClick={() => navigate(LOGIN)}
            style={{ background: "none", border: "none", color: "var(--peach)", fontWeight: 700, fontSize: "13px", cursor: "pointer", padding: 0 }}
          >
            {t("join:nav.login")} →
          </button>
        </div>
      </nav>

      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px 24px 60px", position: "relative", zIndex: 1 }}>
        <div style={{ width: "100%", maxWidth: "440px", opacity: mounted ? 1 : 0, transform: mounted ? "translateY(0)" : "translateY(24px)", transition: "all 0.55s cubic-bezier(0.34,1.1,0.64,1) 0.1s" }}>
          <div className="login-card">

            {loading && (
              <div style={{ display: "flex", justifyContent: "center", padding: "24px 0" }}>
                <span className="spinner" style={{ borderColor: "var(--peach)" }} />
              </div>
            )}

            {/* Ссылка битая, протухла или сотрудника уже убрали из студии */}
            {!loading && !invite && (
              <div style={{ display: "flex", flexDirection: "column", gap: "14px", textAlign: "center" }}>
                <div style={{ width: "56px", height: "56px", borderRadius: "18px", background: "rgba(216,140,154,0.12)", color: "#D88C9A", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto" }}>
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
                </div>
                <h1 style={{ fontSize: "22px", fontWeight: 900, color: "var(--onyx)", letterSpacing: "-0.6px", margin: 0 }}>{t("join:expired.title")}</h1>
                <p style={{ fontSize: "14px", color: "var(--muted)", margin: 0, lineHeight: 1.6 }}>
                  {loadError || (token ? t("join:expired.sub") : t("join:errors.noToken"))}
                </p>
                <PrimaryBtn onClick={() => navigate(LOGIN)} fullWidth>{t("join:expired.cta")}</PrimaryBtn>
              </div>
            )}

            {!loading && invite && (
              <>
                {/* Карточка студии — человек должен сразу видеть, куда именно его зовут */}
                <div style={{ display: "flex", alignItems: "center", gap: "14px", padding: "14px 16px", background: "rgba(252,174,145,0.06)", border: "1.5px solid rgba(252,174,145,0.22)", borderRadius: "16px" }}>
                  <div style={{ width: "44px", height: "44px", borderRadius: "13px", flexShrink: 0, overflow: "hidden", background: logoSrc ? "transparent" : "linear-gradient(135deg,#FCAE91,#F9A08B)", color: "#FFFFFF", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "15px", fontWeight: 800, boxShadow: "0 6px 18px rgba(252,174,145,0.28)" }}>
                    {logoSrc ? <img src={logoSrc} alt={invite.studio_name} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : initials(invite.studio_name)}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: "15px", fontWeight: 800, color: "var(--onyx)", letterSpacing: "-0.3px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{invite.studio_name}</div>
                    <div style={{ fontSize: "12px", color: "var(--muted)", marginTop: "2px" }}>{t("join:card.roleLine", { role: roleLabel })}</div>
                  </div>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <h1 style={{ fontSize: "26px", fontWeight: 900, color: "var(--onyx)", letterSpacing: "-0.8px", margin: 0, lineHeight: 1.1 }}>
                    {needsPassword ? t("join:title.new", { name: invite.name }) : t("join:title.existing", { name: invite.name })}
                  </h1>
                  <p style={{ fontSize: "14px", color: "var(--muted)", margin: 0, lineHeight: 1.5 }}>
                    {needsPassword ? t("join:sub.new") : t("join:sub.existing", { email: invite.email })}
                  </p>
                </div>

                {/* Уже вошли другим аккаунтом: принятие переключит сессию */}
                {otherAccount && (
                  <div style={{ display: "flex", alignItems: "flex-start", gap: "10px", padding: "12px 14px", background: "rgba(26,26,26,0.03)", border: "1px solid rgba(26,26,26,0.07)", borderRadius: "12px" }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="1.9" strokeLinecap="round" style={{ flexShrink: 0, marginTop: "2px" }}>
                      <path d="M16 3h3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-3" /><polyline points="10 17 15 12 10 7" /><line x1="15" y1="12" x2="3" y2="12" />
                    </svg>
                    <p style={{ fontSize: "12.5px", color: "var(--muted)", margin: 0, lineHeight: 1.55 }}>
                      {t("join:switch.notice", { current: otherAccount.email, next: invite.email })}
                    </p>
                  </div>
                )}

                <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                  <ErrorAlert message={submitError} />

                  <InputField
                    label={needsPassword ? t("join:fields.newPassword") : t("join:fields.password")}
                    type={showPassword ? "text" : "password"}
                    placeholder={needsPassword ? t("join:fields.newPasswordPlaceholder") : t("join:fields.passwordPlaceholder")}
                    value={password}
                    autoComplete={needsPassword ? "new-password" : "current-password"}
                    onChange={(v: string) => { setPassword(v); setFieldError(e => ({ ...e, password: undefined })); }}
                    icon={ICON_LOCK}
                    rightSlot={
                      <button
                        onClick={() => setShowPassword(v => !v)}
                        style={{ background: "none", border: "none", cursor: "pointer", color: showPassword ? "var(--peach)" : "var(--muted)", padding: 0, height: "100%", display: "flex", alignItems: "center", transition: "color 0.2s", outline: "none" }}
                      >
                        {showPassword ? t("join:fields.hide") : t("join:fields.show")}
                      </button>
                    }
                    error={fieldError.password}
                  />

                  {needsPassword && (
                    <>
                      <PasswordStrength password={password} />
                      <InputField
                        label={t("join:fields.confirm")}
                        type={showPassword ? "text" : "password"}
                        placeholder={t("join:fields.confirmPlaceholder")}
                        value={confirm}
                        autoComplete="new-password"
                        onChange={(v: string) => { setConfirm(v); setFieldError(e => ({ ...e, confirm: undefined })); }}
                        icon={ICON_LOCK}
                        error={fieldError.confirm}
                      />
                    </>
                  )}
                </div>

                <PrimaryBtn onClick={handleSubmit} loading={submitting} fullWidth>
                  {needsPassword ? t("join:cta.new") : t("join:cta.existing")}
                </PrimaryBtn>

                {!needsPassword && (
                  <p style={{ fontSize: "12px", color: "var(--muted)", margin: 0, textAlign: "center", lineHeight: 1.6 }}>
                    {t("join:forgotHint")}{" "}
                    <button
                      onClick={() => navigate(LOGIN)}
                      style={{ background: "none", border: "none", color: "var(--peach)", fontWeight: 700, fontSize: "12px", cursor: "pointer", padding: 0 }}
                    >
                      {t("join:forgotLink")}
                    </button>
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
