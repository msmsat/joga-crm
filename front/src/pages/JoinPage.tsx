import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import "../App.css";
import { Orbs, Logo, InputField, PhoneField, PrimaryBtn, ErrorAlert } from "../components/UI";
import { authApi, ApiError } from "../api";
import { resolveImageUrl } from "../api/client";
import type { InviteInfo, UserMe } from "../api/auth/auth.types";
import { getActiveToken, setActiveToken } from '../utils/auth';

// Уход на форму входа именно с ?switch=1: без него PublicRoute уводит на
// дашборд, если в браузере уже открыт чей-то аккаунт — а по ссылке-приглашению
// человек как раз чаще всего приходит в чужую сессию.
const LOGIN = "/login?switch=1";

// Инициалы студии для карточки без лого — как в LinkedAccounts / SelectCrm.
function initials(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() ?? "").join("");
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
  const [showPassword, setShowPassword] = useState(false);
  // Телефон спрашиваем только у тех, у кого его в аккаунте нет: владелец заводит
  // сотрудника по одному email, а номер знает сам сотрудник.
  const [phone, setPhone] = useState("");
  const [fieldError, setFieldError] = useState<{ password?: string; phone?: string }>({});
  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  // Отказ — вторая половина согласия. Спрашиваем подтверждение: приглашение
  // снимается насовсем, и владельцу придётся звать заново.
  const [confirmDecline, setConfirmDecline] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [declined, setDeclined] = useState(false);

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
    if (!getActiveToken()) return;
    authApi.getMe().then(setCurrentUser).catch(() => setCurrentUser(null));
  }, []);

  const isNewAccount = invite?.is_new_account ?? false;
  const needsPhone = invite?.needs_phone ?? false;
  // Приглашение адресовано другому аккаунту, а в браузере открыт этот — предупреждаем
  // заранее: принятие заменит активную сессию (переключение аккаунта).
  const otherAccount = currentUser && invite && currentUser.email !== invite.email ? currentUser : null;

  // Пароль здесь вводят, а не придумывают, поэтому проверяем только «непусто» —
  // верность решает сервер, сверяя с хэшем.
  const validate = () => {
    const errs: { password?: string; phone?: string } = {};
    if (!password) errs.password = t("join:errors.passwordRequired");
    // Формат добивает бэкенд (E.164): здесь достаточно «номер есть и он не огрызок».
    if (needsPhone && phone.replace(/\D/g, "").length < 8) errs.phone = t("join:errors.phoneRequired");
    setFieldError(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate() || submitting) return;
    setSubmitting(true);
    setSubmitError("");
    try {
      const data = await authApi.acceptInvite({ token, password, phone: needsPhone ? phone : undefined });
      if (data.two_fa_required) {
        // У аккаунта включена 2FA — код уже отправлен, добиваем вход обычной формой.
        navigate(LOGIN);
        return;
      }
      if (data.access_token) {
        setActiveToken(data.access_token);
        navigate("/dashboard");
      }
    } catch (err: unknown) {
      setSubmitError(err instanceof ApiError ? err.message : t("join:errors.network"));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDecline = async () => {
    if (declining) return;
    setDeclining(true);
    setSubmitError("");
    try {
      await authApi.declineInvite({ token });
      setDeclined(true);
    } catch (err: unknown) {
      setSubmitError(err instanceof ApiError ? err.message : t("join:errors.network"));
      setConfirmDecline(false);
    } finally {
      setDeclining(false);
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

            {/* Отказ принят: членство снято, в студию человека не добавили */}
            {!loading && declined && (
              <div style={{ display: "flex", flexDirection: "column", gap: "14px", textAlign: "center" }}>
                <div style={{ width: "56px", height: "56px", borderRadius: "18px", background: "rgba(163,201,168,0.14)", color: "#7aab80", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto" }}>
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                </div>
                <h1 style={{ fontSize: "22px", fontWeight: 900, color: "var(--onyx)", letterSpacing: "-0.6px", margin: 0 }}>{t("join:declined.title")}</h1>
                <p style={{ fontSize: "14px", color: "var(--muted)", margin: 0, lineHeight: 1.6 }}>{t("join:declined.sub")}</p>
                <PrimaryBtn onClick={() => navigate(LOGIN)} fullWidth>{t("join:expired.cta")}</PrimaryBtn>
              </div>
            )}

            {!loading && invite && !declined && (
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
                    {isNewAccount ? t("join:title.new", { name: invite.name }) : t("join:title.existing", { name: invite.name })}
                  </h1>
                  <p style={{ fontSize: "14px", color: "var(--muted)", margin: 0, lineHeight: 1.5 }}>
                    {isNewAccount ? t("join:sub.new") : t("join:sub.existing", { email: invite.email })}
                  </p>
                </div>

                {/* Уже вошли другим аккаунтом: принятие переключит сессию */}
                {otherAccount && (
                  <div style={{ display: "flex", alignItems: "flex-start", gap: "10px", padding: "12px 14px", background: "rgba(var(--ink),0.03)", border: "1px solid rgba(var(--ink),0.07)", borderRadius: "12px" }}>
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
                    label={isNewAccount ? t("join:fields.newPassword") : t("join:fields.password")}
                    type={showPassword ? "text" : "password"}
                    placeholder={isNewAccount ? t("join:fields.newPasswordPlaceholder") : t("join:fields.passwordPlaceholder")}
                    value={password}
                    autoComplete="current-password"
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

                  {needsPhone && (
                    <PhoneField
                      label={t("join:fields.phone")}
                      value={phone}
                      onChange={(v: string | undefined) => { setPhone(v || ""); setFieldError(e => ({ ...e, phone: undefined })); }}
                      error={fieldError.phone}
                      hint={t("join:fields.phoneHint")}
                    />
                  )}

                </div>

                {/* Человек ждёт письма с паролем — объясняем, почему его там нет */}
                {isNewAccount && (
                  <p style={{ fontSize: "12px", color: "var(--muted)", margin: 0, lineHeight: 1.6 }}>
                    {t("join:newAccountHint")}
                  </p>
                )}

                <PrimaryBtn onClick={handleSubmit} loading={submitting} fullWidth>
                  {t("join:cta.accept")}
                </PrimaryBtn>

                {/* Отказ. Второй шаг — подтверждение: приглашение снимается
                    насовсем, и вернуть его может только владелец студии. */}
                {confirmDecline ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: "10px", padding: "14px 16px", background: "rgba(216,140,154,0.06)", border: "1.5px solid rgba(216,140,154,0.22)", borderRadius: "14px" }}>
                    <p style={{ fontSize: "12.5px", color: "var(--muted)", margin: 0, lineHeight: 1.55 }}>
                      {t("join:decline.confirm", { studio: invite.studio_name })}
                    </p>
                    <div style={{ display: "flex", gap: "8px" }}>
                      <button
                        onClick={() => setConfirmDecline(false)}
                        style={{ flex: 1, padding: "10px", background: "transparent", border: "1.5px solid rgba(var(--ink),0.1)", borderRadius: "10px", fontSize: "12.5px", fontWeight: 700, color: "var(--muted)", cursor: "pointer" }}
                      >
                        {t("join:decline.keep")}
                      </button>
                      <button
                        onClick={handleDecline}
                        disabled={declining}
                        style={{ flex: 1, padding: "10px", background: "#D88C9A", border: "none", borderRadius: "10px", fontSize: "12.5px", fontWeight: 700, color: "#FFFFFF", cursor: declining ? "default" : "pointer", opacity: declining ? 0.6 : 1 }}
                      >
                        {declining ? t("join:decline.pending") : t("join:decline.confirmCta")}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmDecline(true)}
                    style={{ background: "none", border: "none", color: "var(--muted)", fontWeight: 600, fontSize: "12.5px", cursor: "pointer", padding: 0, textDecoration: "underline", textUnderlineOffset: "3px" }}
                  >
                    {t("join:decline.cta")}
                  </button>
                )}

                {!isNewAccount && (
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
