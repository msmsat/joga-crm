import { useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { FieldLabel, FocusInput } from "../../../../../components/modals/EditStaffModal";
import { PhoneField } from "../../../../../components/UI";
import { useContactCheck } from "../../../../../hooks/useContactCheck";

// Владельцу правим только контакты: имя/роль/доступ живут в «Профиле»,
// а роль owner бэкенд у себя не даёт менять этим эндпоинтом вообще.

export interface OwnerContact {
  id: number;          // нужен, чтобы исключить себя из проверки занятости контакта
  name: string;
  last_name?: string;
  email: string;
  phone?: string;
  photo_url?: string;
  is_online: boolean;
}

// Монтируется только на время показа — начальные значения берутся из owner,
// поэтому синхронизирующий useEffect не нужен.
interface Props {
  owner: OwnerContact;
  onClose: () => void;
  onSave: (values: { email: string; phone: string }) => Promise<void> | void;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ─── ILLUSTRATION: живая визитка владельца ───────────────────────────────────
function OwnerCardIllus({
  name, photo, is_online, phone, email, phoneOk, emailOk, ownerLabel, phoneLabel, emailLabel, loginNote,
}: {
  name: string; photo?: string; is_online: boolean;
  phone: string; email: string; phoneOk: boolean; emailOk: boolean;
  ownerLabel: string; phoneLabel: string; emailLabel: string; loginNote: string;
}) {
  const initials = name.trim().length >= 2
    ? name.trim().split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase()
    : "?";
  const clip = (s: string, max: number) => (s.length > max ? s.slice(0, max - 1) + "…" : s);

  const rows = [
    { key: "phone", label: phoneLabel, value: phone, ok: phoneOk, y: 180 },
    { key: "email", label: emailLabel, value: email, ok: emailOk, y: 220 },
  ];

  return (
    <svg viewBox="0 0 244 300" fill="none" xmlns="http://www.w3.org/2000/svg"
      style={{ width: "100%", maxWidth: 244, display: "block" }}>
      <defs>
        <radialGradient id="ocBg" cx="50%" cy="28%" r="62%">
          <stop stopColor="rgba(252,174,145,0.12)" />
          <stop offset="1" stopColor="rgba(252,174,145,0)" />
        </radialGradient>
        <linearGradient id="ocAvatar" x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#FCAE91" />
          <stop offset="1" stopColor="#F07B60" />
        </linearGradient>
        <linearGradient id="ocCard" x1="0" y1="0" x2="0" y2="1">
          <stop stopColor="#FFFFFF" />
          <stop offset="1" stopColor="rgba(253,252,251,0.98)" />
        </linearGradient>
        <filter id="ocShadow" x="-15%" y="-10%" width="130%" height="130%">
          <feDropShadow dx="0" dy="6" stdDeviation="14" floodColor="rgba(26,26,26,0.10)" />
        </filter>
        <clipPath id="ocAvatarClip"><circle cx="122" cy="78" r="30" /></clipPath>
      </defs>

      {/* Ambient glow */}
      <ellipse cx="122" cy="120" rx="92" ry="102" fill="url(#ocBg)" />

      {/* Floating sparkles */}
      <circle className="oc-float" cx="26"  cy="52"  r="4.5" fill="#FCAE91" opacity="0.28" />
      <circle className="oc-float oc-float-2" cx="218" cy="60" r="3" fill="#A3C9A8" opacity="0.35" />
      <circle className="oc-float oc-float-3" cx="220" cy="246" r="4" fill="#FCAE91" opacity="0.22" />
      <circle className="oc-float oc-float-2" cx="24" cy="252" r="3" fill="#A3C9A8" opacity="0.30" />

      {/* Card */}
      <rect x="20" y="28" width="204" height="250" rx="20"
        fill="url(#ocCard)" filter="url(#ocShadow)" stroke="#F0EDE8" strokeWidth="1" />
      <path d="M20,48 a20,20 0 0 1 20,-20 h164 a20,20 0 0 1 20,20 v40 h-204 Z" fill="rgba(252,174,145,0.06)" />

      {/* Owner crown badge */}
      <circle cx="200" cy="44" r="12.5" fill="white" stroke="#F0EDE8" strokeWidth="1" />
      <path d="M194.5 47 L195.5 40.5 L198 43.5 L200 39.5 L202 43.5 L204.5 40.5 L205.5 47 Z"
        fill="rgba(252,174,145,0.85)" stroke="rgba(240,123,96,0.5)" strokeWidth="0.8"
        strokeLinejoin="round" />

      {/* Pulsing rings behind avatar */}
      <circle className="oc-ring" cx="122" cy="78" r="30" fill="none" stroke="#FCAE91" strokeWidth="1.2" />
      <circle className="oc-ring oc-ring-2" cx="122" cy="78" r="30" fill="none" stroke="#FCAE91" strokeWidth="1.2" />

      {/* Avatar */}
      {photo ? (
        <image href={photo} x="92" y="48" width="60" height="60" clipPath="url(#ocAvatarClip)" preserveAspectRatio="xMidYMid slice" />
      ) : (
        <>
          <circle cx="122" cy="78" r="30" fill="url(#ocAvatar)" />
          <text x="122" y="85" textAnchor="middle" fontSize="15" fontWeight="800"
            fill="white" fontFamily="Manrope, sans-serif">{initials}</text>
        </>
      )}
      <circle cx="145" cy="100" r="7.5" fill="white" />
      <circle cx="145" cy="100" r="5" fill={is_online ? "#A3C9A8" : "#CCCCCC"} />

      {/* Name */}
      {name.trim().length >= 2 ? (
        <text x="122" y="130" textAnchor="middle" fontSize="12" fontWeight="700"
          fill="#1A1A1A" fontFamily="Manrope, sans-serif">{clip(name, 20)}</text>
      ) : (
        <rect x="72" y="123" width="100" height="8" rx="4" fill="rgba(26,26,26,0.08)" />
      )}

      {/* Owner pill */}
      <rect x="76" y="138" width="92" height="18" rx="9"
        fill="rgba(252,174,145,0.15)" stroke="rgba(252,174,145,0.35)" strokeWidth="1" />
      <text x="122" y="150.5" textAnchor="middle" fontSize="9" fontWeight="700"
        fill="#C07060" fontFamily="Manrope, sans-serif">{clip(ownerLabel, 14)}</text>

      <line x1="40" y1="170" x2="204" y2="170" stroke="#F0EDE8" strokeWidth="1" />

      {/* Contact rows — заполняются по мере ввода */}
      {rows.map((row, i) => (
        <g key={row.key} className={`oc-row oc-row-${i + 1}`}>
          <rect x="36" y={row.y} width="172" height="34" rx="12"
            fill={row.ok ? "rgba(163,201,168,0.07)" : "rgba(26,26,26,0.02)"}
            stroke={row.ok ? "rgba(163,201,168,0.30)" : "rgba(26,26,26,0.06)"} strokeWidth="1" />
          <rect x="44" y={row.y + 8} width="18" height="18" rx="6"
            fill={row.ok ? "rgba(163,201,168,0.18)" : "rgba(252,174,145,0.14)"} />
          <g transform={`translate(47.5 ${row.y + 11.5}) scale(0.46)`}
            fill="none" stroke={row.ok ? "#6A9E72" : "#E0906F"} strokeWidth="2.2"
            strokeLinecap="round" strokeLinejoin="round">
            {row.key === "phone" ? (
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.99 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.92 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 8.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
            ) : (
              <>
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                <polyline points="22,6 12,13 2,6" />
              </>
            )}
          </g>
          <text x="70" y={row.y + 14} fontSize="7" fontWeight="700" letterSpacing="0.8"
            fill="#C4C0BA" fontFamily="Manrope, sans-serif">{row.label.toUpperCase()}</text>
          {row.value.trim() ? (
            <text x="70" y={row.y + 26} fontSize="9.5" fontWeight="700"
              fill="#1A1A1A" fontFamily="Manrope, sans-serif">{clip(row.value, 18)}</text>
          ) : (
            <rect className="oc-skeleton" x="70" y={row.y + 19} width="86" height="7" rx="3.5" fill="rgba(26,26,26,0.07)" />
          )}
          {row.ok && (
            <g className="oc-check">
              <circle cx="192" cy={row.y + 17} r="7.5" fill="#A3C9A8" />
              <path d={`M188.8 ${row.y + 17} L191.3 ${row.y + 19.6} L195.4 ${row.y + 14.4}`}
                stroke="white" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" fill="none" />
            </g>
          )}
        </g>
      ))}

      <text x="122" y="268" textAnchor="middle" fontSize="8.5" fontWeight="600"
        fill="#C4C0BA" fontFamily="Manrope, sans-serif">{clip(loginNote, 34)}</text>
    </svg>
  );
}

// ─── MODAL ────────────────────────────────────────────────────────────────────
export function OwnerContactsModal({ owner, onClose, onSave }: Props) {
  const { t } = useTranslation(["staff", "common"]);
  const [email, setEmail] = useState(owner.email);
  const [phone, setPhone] = useState(owner.phone ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved]   = useState(false);

  const emailOk = EMAIL_RE.test(email.trim());
  const phoneDigits = phone.replace(/\D/g, "").length;
  const phoneOk = phoneDigits >= 6;

  // Контакт — идентификатор аккаунта: занят другим пользователем → «Сохранить» серая.
  // Проверяем только изменённое — то же правило, что у сервера на PUT /staff/{id}.
  const emailCheck = useContactCheck("staff", "email", email, {
    excludeId: owner.id, enabled: emailOk && email.trim() !== owner.email,
  });
  const phoneCheck = useContactCheck("staff", "phone", phone, {
    excludeId: owner.id, enabled: phoneOk && phone.trim() !== (owner.phone ?? ""),
  });

  const emailError = email.trim().length > 0 && !emailOk ? t("staff:editModal.profile.errors.email")
    : emailCheck.taken ? t("common:validation.emailTaken") : undefined;
  const phoneError = phone.trim().length > 0 && !phoneOk ? t("staff:addModal.step1.errors.phone")
    : phoneCheck.taken ? t("common:validation.phoneTaken") : undefined;
  const checkingHint = t("common:validation.checkingContact");
  const dirty = email.trim() !== owner.email || phone.trim() !== (owner.phone ?? "");
  const emailChanged = email.trim() !== owner.email && emailOk;
  const canSave = emailOk && (phone.trim() === "" || phoneOk) && dirty && !saving
    && !emailError && !phoneError
    && !emailCheck.checking && !phoneCheck.checking;

  async function handleSave() {
    if (!canSave) return;
    setSaving(true);
    try {
      await onSave({ email: email.trim(), phone: phone.trim() });
      setSaving(false);
      setSaved(true);
      setTimeout(() => { setSaved(false); onClose(); }, 1100);
    } catch {
      setSaving(false);
    }
  }

  const fullName = [owner.name, owner.last_name].filter(Boolean).join(" ");

  return createPortal(
    <div className="v-overlay" onClick={onClose}>
      <style>{`
        @keyframes ocIn      { from { opacity:0; transform: scale(0.95) translateY(14px) } to { opacity:1; transform: none } }
        @keyframes ocSlideIn { from { opacity:0; transform: translateY(10px) } to { opacity:1; transform: none } }
        @keyframes ocRing    { 0% { transform: scale(1);    opacity:0.45 }
                               100% { transform: scale(1.55); opacity:0 } }
        @keyframes ocFloat   { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-5px) } }
        @keyframes ocCheck   { from { transform: scale(0.4); opacity:0 } to { transform: scale(1); opacity:1 } }
        @keyframes ocShimmer { 0%,100% { opacity:1 } 50% { opacity:0.45 } }
        @keyframes ocSpin    { from { transform: rotate(0) } to { transform: rotate(360deg) } }
        @keyframes ocRowIn   { from { opacity:0; transform: translateY(8px) } to { opacity:1; transform: none } }

        .oc-ring     { animation: ocRing 2.6s ease-out infinite; transform-box: fill-box; transform-origin: center; }
        .oc-ring-2   { animation-delay: 1.3s; }
        .oc-float    { animation: ocFloat 4s ease-in-out infinite; transform-box: fill-box; transform-origin: center; }
        .oc-float-2  { animation-duration: 5.2s; animation-delay: .6s; }
        .oc-float-3  { animation-duration: 6s;   animation-delay: 1.1s; }
        .oc-check    { animation: ocCheck .3s cubic-bezier(0.34,1.4,0.64,1); transform-box: fill-box; transform-origin: center; }
        .oc-skeleton { animation: ocShimmer 1.8s ease-in-out infinite; }
        .oc-row      { animation: ocRowIn .4s cubic-bezier(0.34,1.1,0.64,1) both; transform-box: fill-box; }
        .oc-row-1    { animation-delay: .08s; }
        .oc-row-2    { animation-delay: .16s; }

        .oc-close    { transition: all .2s ease; }
        .oc-close:hover { background: rgba(26,26,26,0.09) !important; color: #1A1A1A !important; }
        .oc-cancel   { transition: all .2s ease; }
        .oc-cancel:hover { background: rgba(26,26,26,0.03) !important; border-color: #DDD !important; }
        .oc-save     { transition: all .25s cubic-bezier(0.34,1.1,0.64,1); }
        .oc-save:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 12px 26px rgba(252,174,145,0.34) !important; }
      `}</style>

      <div
        onClick={e => e.stopPropagation()}
        style={{
          position: "relative",
          width: "100%", maxWidth: "820px", height: "min(544px, calc(100vh - 32px))",
          background: "#FDFCFB", borderRadius: "24px",
          boxShadow: "0 40px 100px rgba(26,26,26,0.18), 0 8px 32px rgba(26,26,26,0.07)",
          display: "grid", gridTemplateColumns: "268px 1fr",
          overflow: "hidden", animation: "ocIn 0.32s cubic-bezier(0.34,1.1,0.64,1)",
          fontFamily: "Manrope, sans-serif",
        }}
      >
        {/* ── LEFT: живая визитка ── */}
        <div style={{
          background: "white", borderRight: "1px solid #F0EDE8",
          display: "flex", flexDirection: "column",
          padding: "26px 22px 20px", position: "relative", overflow: "hidden",
        }}>
          <div style={{
            position: "absolute", inset: 0, pointerEvents: "none",
            backgroundImage: `
              radial-gradient(circle at 15% 8%, rgba(252,174,145,0.08) 0%, transparent 55%),
              radial-gradient(circle at 85% 92%, rgba(163,201,168,0.07) 0%, transparent 55%)
            `,
          }} />

          <div style={{ position: "relative", zIndex: 1 }}>
            <p style={{ fontSize: "10px", fontWeight: 700, color: "#FCAE91", letterSpacing: "2px", textTransform: "uppercase", margin: "0 0 4px" }}>
              {t("staff:ownerModal.header")}
            </p>
            <h2 style={{ fontSize: "16px", fontWeight: 900, color: "#1A1A1A", letterSpacing: "-0.4px", margin: 0, lineHeight: 1.3 }}>
              {fullName || t("staff:editModal.employeeFallback")}
            </h2>
            <p style={{ fontSize: "11px", color: "#AAAAAA", margin: "3px 0 0" }}>
              {t("staff:roles.owner")}
            </p>
          </div>

          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", position: "relative", zIndex: 1, paddingTop: "8px" }}>
            <OwnerCardIllus
              name={fullName}
              photo={owner.photo_url}
              is_online={owner.is_online}
              phone={phone}
              email={email}
              phoneOk={phoneOk}
              emailOk={emailOk}
              ownerLabel={t("staff:roles.owner")}
              phoneLabel={t("common:fields.phone")}
              emailLabel={t("common:fields.email")}
              loginNote={t("staff:ownerModal.cardNote")}
            />
          </div>
        </div>

        {/* ── RIGHT: форма ── */}
        <div style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <button className="oc-close" onClick={onClose} style={{
            position: "absolute", top: "16px", right: "16px", zIndex: 10,
            width: "28px", height: "28px",
            background: "rgba(26,26,26,0.05)", border: "none", borderRadius: "8px",
            cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
            color: "#AAAAAA",
          }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>

          <div style={{ flex: 1, overflowY: "auto", padding: "34px 30px 16px" }}>
            <h3 style={{ fontSize: "20px", fontWeight: 900, color: "#1A1A1A", letterSpacing: "-0.6px", margin: "0 0 4px" }}>
              {t("staff:ownerModal.heading")}
            </h3>
            <p style={{ fontSize: "12px", color: "#AAAAAA", margin: "0 0 24px" }}>
              {t("staff:ownerModal.sub")}
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div>
                <FieldLabel>{t("common:fields.phone")}</FieldLabel>
                <PhoneField value={phone} onChange={(v: string | undefined) => setPhone(v || "")}
                  error={phoneError}
                  hint={phoneCheck.checking ? checkingHint : undefined} />
              </div>
              <div>
                <FieldLabel>{t("common:fields.email")} *</FieldLabel>
                <FocusInput type="email" value={email} onChange={setEmail}
                  placeholder="owner@velora.studio" error={emailError}
                  hint={emailCheck.checking ? checkingHint : undefined}
                  onKeyDown={e => { if (e.key === "Enter") handleSave(); }} />
              </div>

              {/* Предупреждение: email — это логин */}
              {emailChanged && (
                <div style={{
                  padding: "12px 14px", borderRadius: "12px",
                  background: "rgba(252,174,145,0.08)", border: "1.5px solid rgba(252,174,145,0.28)",
                  display: "flex", gap: "10px", alignItems: "flex-start",
                  animation: "ocSlideIn 0.25s ease",
                }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#E0906F" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: "1px" }}>
                    <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                  <p style={{ fontSize: "11.5px", color: "#8A6A5E", margin: 0, lineHeight: 1.55, fontWeight: 600 }}>
                    {t("staff:ownerModal.loginWarning")}
                  </p>
                </div>
              )}

              {/* Что здесь не меняется */}
              <div style={{
                padding: "12px 14px", borderRadius: "12px",
                background: "rgba(26,26,26,0.02)", border: "1px solid rgba(26,26,26,0.07)",
                display: "flex", gap: "10px", alignItems: "flex-start",
              }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#A3C9A8" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: "1px" }}>
                  <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <p style={{ fontSize: "11.5px", color: "#888", margin: 0, lineHeight: 1.55 }}>
                  {t("staff:ownerModal.lockedHint")}
                </p>
              </div>
            </div>
          </div>

          {/* ── Footer ── */}
          <div style={{
            padding: "14px 30px 18px", borderTop: "1px solid #F0EDE8",
            display: "flex", gap: "10px", alignItems: "center", flexShrink: 0,
          }}>
            <button type="button" className="oc-cancel" onClick={onClose} style={{
              padding: "12px 18px", background: "transparent",
              border: "1.5px solid #EEEBE6", borderRadius: "12px",
              fontSize: "13px", fontWeight: 600, color: "#888",
              cursor: "pointer", fontFamily: "inherit",
            }}>
              {t("common:buttons.cancel")}
            </button>

            <button
              type="button" className="oc-save" disabled={!canSave || saved} onClick={handleSave}
              style={{
                flex: 1, padding: "12px 22px",
                // Недоступная кнопка серая: занятый контакт должен читаться как «нельзя».
                background: saved
                  ? "linear-gradient(135deg, #A3C9A8, #7aab80)"
                  : !canSave
                    ? "rgba(26,26,26,0.06)"
                    : "linear-gradient(135deg, #FCAE91, #F9A08B)",
                border: "none", borderRadius: "12px",
                fontSize: "14px", fontWeight: 700, color: !canSave && !saved ? "#AAAAAA" : "white",
                cursor: canSave ? "pointer" : "not-allowed",
                display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
                boxShadow: !canSave && !saved ? "none"
                  : saved ? "0 8px 24px rgba(163,201,168,0.3)" : "0 8px 24px rgba(252,174,145,0.3)",
                opacity: 1,
                fontFamily: "inherit", letterSpacing: "-0.1px",
              }}
            >
              {saving ? (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" style={{ animation: "ocSpin 0.8s linear infinite" }}>
                    <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                  </svg>
                  {t("common:buttons.saving")}
                </>
              ) : saved ? (
                <span style={{ display: "flex", alignItems: "center", gap: "7px", animation: "ocCheck 0.3s cubic-bezier(0.34,1.4,0.64,1)" }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  {t("common:buttons.saved")}
                </span>
              ) : (
                <>
                  {t("common:buttons.saveChanges")}
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                    <path d="M6 4L10 8L6 12" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
