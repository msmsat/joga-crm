import { useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { isValidPhoneNumber } from "react-phone-number-input";
import "../../../../../App.css";
import { Logo, PhoneField } from "../../../../../components/UI";
import { Input, PhotoUpload } from "../../../../../components/ui/modal";
import { studioApi } from "../../../../../api/studio/studio.api";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ─── TYPES ────────────────────────────────────────────────────────────────────
type Step = 1 | 2 | 3;

interface StudioFormData {
  name: string;
  phone: string;
  email: string;
  country: string;
  city: string;
  address: string;
  photo_url: string | null;
}

// ─── ILLUSTRATIONS ─────────────────────────────────────────────────────────────

function Illus1({ name, contactsLabel, newBranchLabel }: { name: string; contactsLabel: string; newBranchLabel: string }) {
  const hasName = name.trim().length >= 2;
  return (
    <svg viewBox="0 0 260 240" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: "100%", maxWidth: 260 }}>
      <defs>
        <radialGradient id="s1bg" cx="50%" cy="50%" r="50%">
          <stop stopColor="rgba(252,174,145,0.12)" />
          <stop offset="1" stopColor="rgba(252,174,145,0)" />
        </radialGradient>
        <linearGradient id="s1accent" x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#FCAE91" /><stop offset="1" stopColor="#F07B60" />
        </linearGradient>
        <filter id="s1shadow">
          <feDropShadow dx="0" dy="8" stdDeviation="16" floodColor="rgba(26,26,26,0.10)" />
        </filter>
      </defs>

      <ellipse cx="130" cy="120" rx="90" ry="80" fill="url(#s1bg)" />
      <circle cx="36" cy="60" r="5" fill="#FCAE91" opacity="0.3" />
      <circle cx="224" cy="72" r="3.5" fill="#A3C9A8" opacity="0.4" />
      <circle cx="218" cy="180" r="5" fill="#FCAE91" opacity="0.25" />
      <circle cx="42" cy="186" r="3" fill="#A3C9A8" opacity="0.35" />

      {/* Main card */}
      <rect x="32" y="44" width="196" height="148" rx="20" fill="white" filter="url(#s1shadow)" stroke="#F0EDE8" strokeWidth="1" />
      <rect x="32" y="44" width="196" height="56" rx="20" fill="rgba(252,174,145,0.05)" />
      <rect x="32" y="84" width="196" height="16" fill="rgba(252,174,145,0.05)" />

      {/* Building icon */}
      <rect x="108" y="66" width="44" height="36" rx="4" fill={hasName ? "url(#s1accent)" : "rgba(26,26,26,0.06)"} />
      <rect x="118" y="78" width="8" height="8" rx="1.5" fill="rgba(255,255,255,0.7)" />
      <rect x="134" y="78" width="8" height="8" rx="1.5" fill="rgba(255,255,255,0.7)" />
      <rect x="122" y="90" width="16" height="12" rx="2" fill="rgba(255,255,255,0.5)" />
      {/* Roof */}
      <path d="M104 68 L130 52 L156 68" stroke={hasName ? "#F07B60" : "#DDD"} strokeWidth="2" strokeLinejoin="round" fill="none" />

      {/* Name line */}
      {hasName ? (
        <text x="130" y="126" textAnchor="middle" fontSize="11" fontWeight="700" fill="#1A1A1A" fontFamily="Manrope, sans-serif">
          {name.length > 18 ? name.slice(0, 18) + "…" : name}
        </text>
      ) : (
        <rect x="84" y="119" width="92" height="8" rx="4" fill="rgba(26,26,26,0.07)" />
      )}

      <rect x="100" y="136" width="60" height="5" rx="2.5" fill="rgba(26,26,26,0.04)" />

      {/* Bottom chips */}
      <rect x="48" y="154" width="68" height="12" rx="6" fill="rgba(252,174,145,0.15)" stroke="rgba(252,174,145,0.3)" strokeWidth="1" />
      <text x="82" y="163.5" textAnchor="middle" fontSize="7.5" fontWeight="700" fill="#D07A5A" fontFamily="Manrope, sans-serif">{contactsLabel}</text>
      <rect x="124" y="154" width="80" height="12" rx="6" fill="rgba(163,201,168,0.15)" stroke="rgba(163,201,168,0.3)" strokeWidth="1" />
      <text x="164" y="163.5" textAnchor="middle" fontSize="7.5" fontWeight="700" fill="#5A8A60" fontFamily="Manrope, sans-serif">{newBranchLabel}</text>
    </svg>
  );
}

function Illus2({ city, country, cityLabel, newBranchStudioLabel }: { city: string; country: string; cityLabel: string; newBranchStudioLabel: string }) {
  const hasCity = city.trim().length >= 1;
  return (
    <svg viewBox="0 0 260 240" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: "100%", maxWidth: 260 }}>
      <defs>
        <radialGradient id="s2bg" cx="50%" cy="40%" r="55%">
          <stop stopColor="rgba(163,201,168,0.12)" />
          <stop offset="1" stopColor="rgba(163,201,168,0)" />
        </radialGradient>
        <linearGradient id="s2pin" x1="0" y1="0" x2="0" y2="1">
          <stop stopColor="#FCAE91" /><stop offset="1" stopColor="#F9A08B" />
        </linearGradient>
        <filter id="s2shadow">
          <feDropShadow dx="0" dy="8" stdDeviation="14" floodColor="rgba(26,26,26,0.10)" />
        </filter>
      </defs>

      <ellipse cx="130" cy="115" rx="88" ry="76" fill="url(#s2bg)" />

      {/* Map card */}
      <rect x="28" y="38" width="204" height="138" rx="20" fill="white" filter="url(#s2shadow)" stroke="#F0EDE8" strokeWidth="1" />

      {/* Map grid lines */}
      {[60, 82, 104, 126].map(y => (
        <line key={y} x1="28" y1={y} x2="232" y2={y} stroke="rgba(26,26,26,0.04)" strokeWidth="1" />
      ))}
      {[62, 96, 130, 164, 198].map(x => (
        <line key={x} x1={x} y1="38" x2={x} y2="176" stroke="rgba(26,26,26,0.04)" strokeWidth="1" />
      ))}

      {/* Roads */}
      <path d="M28 107 Q80 100 130 107 Q180 114 232 107" stroke="rgba(26,26,26,0.06)" strokeWidth="6" fill="none" />
      <line x1="130" y1="38" x2="130" y2="176" stroke="rgba(26,26,26,0.05)" strokeWidth="5" />

      {/* Map pin */}
      <circle cx="130" cy="96" r="22" fill="rgba(252,174,145,0.15)" />
      <path d="M130 74 C120 74 113 81 113 90 C113 103 130 118 130 118 C130 118 147 103 147 90 C147 81 140 74 130 74 Z" fill="url(#s2pin)" />
      <circle cx="130" cy="90" r="6" fill="white" />

      {/* Info card at bottom */}
      <rect x="44" y="150" width="172" height="40" rx="12" fill="white" stroke="#F0EDE8" strokeWidth="1" filter="url(#s2shadow)" />
      {hasCity ? (
        <>
          <text x="60" y="166" fontSize="10" fontWeight="800" fill="#1A1A1A" fontFamily="Manrope, sans-serif">
            {(hasCity ? city : cityLabel) + (country ? ", " + country : "")}
          </text>
          <text x="60" y="180" fontSize="8.5" fontWeight="500" fill="#AAAAAA" fontFamily="Manrope, sans-serif">{newBranchStudioLabel}</text>
        </>
      ) : (
        <>
          <rect x="60" y="158" width="80" height="7" rx="3.5" fill="rgba(26,26,26,0.07)" />
          <rect x="60" y="171" width="56" height="5" rx="2.5" fill="rgba(26,26,26,0.04)" />
        </>
      )}
      <circle cx="52" cy="171" r="6" fill="rgba(252,174,145,0.2)" />
      <path d="M49 171 L52 174 L56 167" stroke="#FCAE91" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />

      <circle cx="38" cy="56" r="4" fill="#FCAE91" opacity="0.3" />
      <circle cx="222" cy="52" r="3" fill="#A3C9A8" opacity="0.4" />
      <circle cx="36" cy="178" r="3.5" fill="#A3C9A8" opacity="0.3" />
      <circle cx="224" cy="182" r="4" fill="#FCAE91" opacity="0.25" />
    </svg>
  );
}

function Illus3({ hasPhoto }: { hasPhoto: boolean }) {
  return (
    <svg viewBox="0 0 260 240" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: "100%", maxWidth: 260 }}>
      <defs>
        <radialGradient id="s3glow" cx="50%" cy="45%" r="50%">
          <stop stopColor="rgba(163,201,168,0.18)" />
          <stop offset="1" stopColor="rgba(163,201,168,0)" />
        </radialGradient>
        <linearGradient id="s3green" x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#A3C9A8" /><stop offset="1" stopColor="#7aab80" />
        </linearGradient>
        <linearGradient id="s3peach" x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#FCAE91" /><stop offset="1" stopColor="#F9A08B" />
        </linearGradient>
        <filter id="s3shadow">
          <feDropShadow dx="0" dy="8" stdDeviation="14" floodColor="rgba(26,26,26,0.10)" />
        </filter>
      </defs>

      <ellipse cx="130" cy="104" rx="82" ry="74" fill="url(#s3glow)" />

      {/* Confetti */}
      {[
        [62, 56, 5, "#FCAE91", 0.5], [196, 48, 4, "#A3C9A8", 0.5],
        [212, 84, 3, "#FCAE91", 0.4], [46, 90, 3, "#A3C9A8", 0.4],
        [72, 182, 4, "#A3C9A8", 0.35], [188, 176, 4.5, "#FCAE91", 0.35],
      ].map(([x, y, r, fill, op], i) => (
        <circle key={i} cx={x as number} cy={y as number} r={r as number} fill={fill as string} opacity={op as number} />
      ))}

      {/* Success circle */}
      <circle cx="130" cy="94" r="38" fill="rgba(163,201,168,0.1)" />
      <circle cx="130" cy="94" r="28" fill="white" filter="url(#s3shadow)" stroke="#F0EDE8" strokeWidth="1" />
      {hasPhoto ? (
        <>
          <rect x="114" y="82" width="32" height="24" rx="5" fill="rgba(252,174,145,0.2)" />
          <circle cx="122" cy="90" r="3" fill="rgba(252,174,145,0.6)" />
          <path d="M112 102 L120 94 L126 100 L132 95 L148 102" stroke="rgba(252,174,145,0.7)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          <path d="M121 108 L129 102 L137 108" stroke="#A3C9A8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </>
      ) : (
        <path d="M117 94 L126 103 L143 82" stroke="url(#s3green)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      )}

      {/* Caption */}
      <rect x="52" y="138" width="156" height="36" rx="14" fill="white" filter="url(#s3shadow)" stroke="#F0EDE8" strokeWidth="1" />
      <rect x="66" y="149" width="100" height="7" rx="3.5" fill="rgba(163,201,168,0.35)" />
      <rect x="80" y="161" width="72" height="5" rx="2.5" fill="rgba(26,26,26,0.06)" />
    </svg>
  );
}

// ─── SUB-COMPONENTS ───────────────────────────────────────────────────────────
function StepDots({ current, total }: { current: number; total: number }) {
  return (
    <div style={{ display: "flex", gap: "5px", alignItems: "center" }}>
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} style={{
          width: i + 1 === current ? "22px" : "6px",
          height: "6px",
          borderRadius: "3px",
          background: i + 1 <= current ? "#FCAE91" : "rgba(26,26,26,0.1)",
          transition: "all 0.3s cubic-bezier(0.34,1.1,0.64,1)",
        }} />
      ))}
    </div>
  );
}

// ─── MAIN MODAL ───────────────────────────────────────────────────────────────
interface AddStudioModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (data: StudioFormData) => void | Promise<void>;
}

export default function AddStudioModal({ isOpen, onClose, onSuccess }: AddStudioModalProps) {
  const { t } = useTranslation(["catalog", "common"]);
  const [step, setStep] = useState<Step>(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [animating, setAnimating] = useState(false);
  const [dir, setDir] = useState<1 | -1>(1);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [data, setData] = useState<StudioFormData>({
    name: "", phone: "", email: "",
    country: "", city: "", address: "",
    photo_url: null,
  });

  const set = useCallback(<K extends keyof StudioFormData>(k: K, v: StudioFormData[K]) => {
    setData(d => ({ ...d, [k]: v }));
  }, []);

  function goNext() {
    if (animating) return;
    setDir(1);
    setAnimating(true);
    setTimeout(() => {
      setStep(s => Math.min(s + 1, 3) as Step);
      setAnimating(false);
    }, 200);
  }

  function goBack() {
    if (animating || step === 1) return;
    setDir(-1);
    setAnimating(true);
    setTimeout(() => {
      setStep(s => Math.max(s - 1, 1) as Step);
      setAnimating(false);
    }, 200);
  }

  function handleClose() {
    setStep(1);
    setPhotoPreview(null);
    setPhotoFile(null);
    setSubmitError(null);
    setData({ name: "", phone: "", email: "", country: "", city: "", address: "", photo_url: null });
    onClose();
  }

  async function handleFinish() {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setSubmitError(null);

    let photo_url: string | null = null;
    if (photoFile) {
      try {
        photo_url = (await studioApi.uploadBranchPhoto(photoFile)).url;
      } catch {
        setSubmitError(t("catalog:modals.addStudio.step3.uploadError"));
        setIsSubmitting(false);
        return;
      }
    }

    try {
      await onSuccess?.({ ...data, photo_url });
      handleClose();
    } catch {
      // ошибку показывает родитель (тост)
    } finally {
      setIsSubmitting(false);
    }
  }

  function pickPhoto(file: File) {
    setPhotoFile(file);
    const reader = new FileReader();
    reader.onload = ev => {
      setPhotoPreview(ev.target?.result as string);
    };
    reader.readAsDataURL(file);
  }

  function removePhoto() {
    setPhotoPreview(null);
    setPhotoFile(null);
  }

  // Обязательный контакт: имя ≥ 2 И (валидный телефон ИЛИ валидный email);
  // если email заполнен — он должен быть валидным (нельзя пройти с кривым email).
  const phoneValid = !!data.phone && isValidPhoneNumber(data.phone);
  const emailFilled = data.email.trim().length > 0;
  const emailValid = EMAIL_RE.test(data.email.trim());
  const contactOk = phoneValid || emailValid;
  const canStep1 = data.name.trim().length >= 2 && contactOk && (!emailFilled || emailValid);
  const canStep2 = data.city.trim().length >= 2 && data.address.trim().length >= 2;

  const stepMeta = [
    { title: t("catalog:modals.addStudio.steps.about.title"),    sub: t("catalog:modals.addStudio.steps.about.sub"),    trustLabel: t("catalog:modals.addStudio.steps.about.trust") },
    { title: t("catalog:modals.addStudio.steps.location.title"), sub: t("catalog:modals.addStudio.steps.location.sub"), trustLabel: t("catalog:modals.addStudio.steps.location.trust") },
    { title: t("catalog:modals.addStudio.steps.photo.title"),    sub: t("catalog:modals.addStudio.steps.photo.sub"),    trustLabel: t("catalog:modals.addStudio.steps.photo.trust") },
  ];
  const current = stepMeta[step - 1];

  if (!isOpen) return null;

  return createPortal(
    <div
      style={{
        position: "fixed", inset: 0,
        background: "rgba(26,26,26,0.42)",
        backdropFilter: "blur(10px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 1000, padding: "16px",
        animation: "overlayIn 0.22s ease",
      }}
      onClick={handleClose}
    >
      <style>{`
        @keyframes overlayIn { from { opacity:0 } to { opacity:1 } }
        @keyframes modalIn { from { opacity:0; transform: scale(0.93) translateY(20px) } to { opacity:1; transform: scale(1) translateY(0) } }
        @keyframes stepIn { from { opacity:0; transform: translateX(${dir === 1 ? 24 : -24}px) } to { opacity:1; transform: translateX(0) } }
        @keyframes pulse2 { 0%,100% { opacity:1; transform:scale(1) } 50% { opacity:0.5; transform:scale(1.5) } }
        .asm-close-btn:hover { background: rgba(26,26,26,0.1) !important; }
        .asm-back-btn:hover { background: rgba(26,26,26,0.04) !important; border-color: #DDD !important; }
        .asm-scroll::-webkit-scrollbar { width: 3px; }
        .asm-scroll::-webkit-scrollbar-thumb { background: rgba(249,160,139,0.25); border-radius: 3px; }
      `}</style>

      <div
        style={{
          width: "100%", maxWidth: "860px", height: "min(580px, calc(100vh - 32px))",
          background: "#FDFCFB", borderRadius: "24px",
          boxShadow: "0 40px 100px rgba(26,26,26,0.18), 0 8px 32px rgba(26,26,26,0.07)",
          display: "grid", gridTemplateColumns: "280px 1fr",
          overflow: "hidden",
          animation: "modalIn 0.42s cubic-bezier(0.34,1.1,0.64,1)",
        }}
        onClick={e => e.stopPropagation()}
      >

        {/* ──────────── LEFT PANEL ──────────── */}
        <div style={{
          background: "white", padding: "36px 30px 28px",
          display: "flex", flexDirection: "column",
          borderRight: "1px solid #F0EDE8",
          position: "relative", overflow: "hidden",
        }}>
          <div style={{
            position: "absolute", inset: 0, pointerEvents: "none",
            backgroundImage: `
              radial-gradient(circle at 15% 15%, rgba(252,174,145,0.07) 0%, transparent 55%),
              radial-gradient(circle at 85% 85%, rgba(163,201,168,0.07) 0%, transparent 55%)
            `,
          }} />

          <div style={{ position: "relative", zIndex: 1 }}>
            <div style={{ marginBottom: "28px" }}><Logo /></div>
            <p style={{ fontSize: "10px", fontWeight: 700, color: "#FCAE91", letterSpacing: "2px", textTransform: "uppercase", margin: "0 0 6px" }}>
              {t("catalog:modals.addStudio.stepCounter", { current: step, total: 3 })}
            </p>
            <h2 style={{ fontSize: "19px", fontWeight: 900, color: "#1A1A1A", letterSpacing: "-0.6px", lineHeight: 1.25, margin: "0 0 6px" }}>
              {current.title}
            </h2>
            <p style={{ fontSize: "12px", color: "#999", lineHeight: 1.55, margin: "0 0 16px" }}>
              {current.sub}
            </p>
            <StepDots current={step} total={3} />
          </div>

          <div style={{
            flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
            padding: "12px 0", position: "relative", zIndex: 1,
          }}>
            {step === 1 && <Illus1 name={data.name} contactsLabel={t("catalog:modals.addStudio.illus.contacts")} newBranchLabel={t("catalog:modals.addStudio.illus.newBranch")} />}
            {step === 2 && <Illus2 city={data.city} country={data.country} cityLabel={t("catalog:modals.addStudio.illus.city")} newBranchStudioLabel={t("catalog:modals.addStudio.illus.newBranchStudio")} />}
            {step === 3 && <Illus3 hasPhoto={!!photoPreview} />}
          </div>

          <div style={{
            padding: "11px 13px",
            background: "rgba(163,201,168,0.08)",
            borderRadius: "10px",
            position: "relative", zIndex: 1,
          }}>
            {step < 3 ? (
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <div style={{
                  width: "7px", height: "7px", borderRadius: "50%",
                  background: "#A3C9A8", flexShrink: 0,
                  animation: "pulse2 2.2s infinite",
                }} />
                <span style={{ fontSize: "11px", color: "#666", fontWeight: 500 }}>
                  {current.trustLabel}
                </span>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
                {[
                  { l: t("catalog:modals.addStudio.summaryRows.name"),    v: data.name },
                  { l: t("catalog:modals.addStudio.summaryRows.city"),    v: data.city },
                  { l: t("catalog:modals.addStudio.summaryRows.address"), v: data.address },
                ].map(row => (
                  <div key={row.l} style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ fontSize: "11px", color: "#AAAAAA" }}>{row.l}</span>
                    <span style={{ fontSize: "11px", fontWeight: 700, color: "#1A1A1A", maxWidth: "130px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.v || "—"}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ──────────── RIGHT PANEL ──────────── */}
        <div style={{
          padding: "16px 30px 24px",
          display: "flex", flexDirection: "column",
          position: "relative", overflow: "hidden",
        }}>
          <button
            className="asm-close-btn"
            onClick={handleClose}
            style={{
              position: "absolute", top: "14px", right: "14px",
              width: "28px", height: "28px",
              background: "rgba(26,26,26,0.05)", border: "none",
              borderRadius: "8px", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "#AAA", transition: "background 0.15s",
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>

          <div className="asm-scroll" style={{ flex: 1, overflowY: "auto", paddingRight: "4px", marginTop: "28px" }}>
            <div key={step} style={{ animation: "stepIn 0.25s cubic-bezier(0.34,1.1,0.64,1)" }}>

              {/* ══════════ STEP 1 ══════════ */}
              {step === 1 && (
                <div>
                  <h3 style={{ fontSize: "20px", fontWeight: 900, color: "#1A1A1A", letterSpacing: "-0.6px", margin: "0 0 4px" }}>
                    {t("catalog:modals.addStudio.step1.heading")}
                  </h3>
                  <p style={{ fontSize: "12px", color: "#AAA", margin: "0 0 24px" }}>
                    {t("catalog:modals.addStudio.step1.subheading")}
                  </p>

                  <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                    <Input
                      label={t("catalog:modals.addStudio.step1.name")}
                      value={data.name}
                      onChange={(v: string) => set("name", v)}
                      placeholder={t("catalog:modals.addStudio.step1.namePlaceholder")}
                    />
                    <PhoneField
                      label={t("catalog:modals.addStudio.step1.phone")}
                      value={data.phone}
                      onChange={(v: string | undefined) => set("phone", v || "")}
                    />
                    <Input
                      label={t("catalog:modals.addStudio.step1.email")}
                      type="email"
                      value={data.email}
                      onChange={(v: string) => set("email", v)}
                      placeholder="studio@velora.ru"
                    />

                    {!contactOk && (
                      <p style={{ fontSize: "11.5px", color: "#D88C9A", fontWeight: 600, margin: "-6px 0 0" }}>
                        {t("catalog:modals.addStudio.step1.contactHint")}
                      </p>
                    )}

                    {data.name.trim().length >= 2 && (
                      <div style={{
                        padding: "13px 15px",
                        background: "linear-gradient(135deg, rgba(252,174,145,0.07), rgba(163,201,168,0.05))",
                        borderRadius: "14px",
                        border: "1.5px solid rgba(252,174,145,0.2)",
                        display: "flex", alignItems: "center", gap: "12px",
                        animation: "stepIn 0.25s ease",
                      }}>
                        <div style={{
                          width: "40px", height: "40px", borderRadius: "12px", flexShrink: 0,
                          background: "linear-gradient(135deg, #FCAE91, #F9A08B)",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          boxShadow: "0 4px 12px rgba(252,174,145,0.3)",
                        }}>
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                            <polyline points="9 22 9 12 15 12 15 22"/>
                          </svg>
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: "13px", fontWeight: 700, color: "#1A1A1A", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {data.name}
                          </div>
                          <div style={{ fontSize: "11px", color: "#AAA", marginTop: "2px" }}>
                            {data.phone || data.email || t("catalog:modals.addStudio.step1.noContacts")}
                          </div>
                        </div>
                        <div style={{
                          padding: "3px 8px", borderRadius: "6px",
                          background: "rgba(163,201,168,0.18)",
                          fontSize: "9px", fontWeight: 700, color: "#5A8A60", letterSpacing: "0.5px",
                        }}>
                          {t("catalog:modals.addStudio.step1.new")}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ══════════ STEP 2 ══════════ */}
              {step === 2 && (
                <div>
                  <h3 style={{ fontSize: "20px", fontWeight: 900, color: "#1A1A1A", letterSpacing: "-0.6px", margin: "0 0 4px" }}>
                    {t("catalog:modals.addStudio.step2.heading")}
                  </h3>
                  <p style={{ fontSize: "12px", color: "#AAA", margin: "0 0 24px" }}>
                    {t("catalog:modals.addStudio.step2.subheading")}
                  </p>

                  <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                      <Input
                        label={t("catalog:modals.addStudio.step2.country")}
                        value={data.country}
                        onChange={v => set("country", v)}
                        placeholder={t("catalog:modals.addStudio.step2.countryPlaceholder")}
                      />
                      <Input
                        label={t("catalog:modals.addStudio.step2.city")}
                        value={data.city}
                        onChange={v => set("city", v)}
                        placeholder={t("catalog:modals.addStudio.step2.cityPlaceholder")}
                      />
                    </div>
                    <Input
                      label={t("catalog:modals.addStudio.step2.address")}
                      value={data.address}
                      onChange={v => set("address", v)}
                      placeholder={t("catalog:modals.addStudio.step2.addressPlaceholder")}
                    />

                    {data.city.trim().length >= 1 && (
                      <div style={{
                        padding: "13px 15px",
                        background: "rgba(163,201,168,0.07)",
                        borderRadius: "14px",
                        border: "1.5px solid rgba(163,201,168,0.2)",
                        display: "flex", alignItems: "center", gap: "12px",
                        animation: "stepIn 0.25s ease",
                      }}>
                        <div style={{
                          width: "36px", height: "36px", borderRadius: "10px", flexShrink: 0,
                          background: "rgba(252,174,145,0.15)",
                          display: "flex", alignItems: "center", justifyContent: "center",
                        }}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#FCAE91" strokeWidth="2">
                            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                            <circle cx="12" cy="10" r="3"/>
                          </svg>
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: "13px", fontWeight: 700, color: "#1A1A1A" }}>
                            {data.city}{data.country ? `, ${data.country}` : ""}
                          </div>
                          <div style={{ fontSize: "11px", color: "#AAA", marginTop: "2px" }}>
                            {data.address || t("catalog:modals.addStudio.step2.noAddress")}
                          </div>
                        </div>
                      </div>
                    )}

                    <div style={{
                      padding: "11px 14px",
                      background: "rgba(252,174,145,0.06)",
                      borderRadius: "12px",
                      border: "1px solid rgba(252,174,145,0.18)",
                      display: "flex", gap: "9px", alignItems: "flex-start",
                    }}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#FCAE91" strokeWidth="1.8" style={{ flexShrink: 0, marginTop: "1px" }}>
                        <circle cx="12" cy="12" r="10"/>
                        <line x1="12" y1="8" x2="12" y2="12"/>
                        <line x1="12" y1="16" x2="12.01" y2="16"/>
                      </svg>
                      <p style={{ fontSize: "11.5px", color: "#888", margin: 0, lineHeight: 1.55 }}>
                        {t("catalog:modals.addStudio.step2.groupHint")}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* ══════════ STEP 3 ══════════ */}
              {step === 3 && (
                <div>
                  <h3 style={{ fontSize: "20px", fontWeight: 900, color: "#1A1A1A", letterSpacing: "-0.6px", margin: "0 0 4px" }}>
                    {t("catalog:modals.addStudio.step3.heading")}
                  </h3>
                  <p style={{ fontSize: "12px", color: "#AAA", margin: "0 0 22px" }}>
                    {t("catalog:modals.addStudio.step3.subheading")}
                  </p>

                  <div style={{ marginBottom: "16px" }}>
                    <PhotoUpload
                      preview={photoPreview}
                      onFile={pickPhoto}
                      onRemove={removePhoto}
                      ctaText={t("catalog:modals.addStudio.step3.uploadCta")}
                      hintText={t("catalog:modals.addStudio.step3.uploadHint")}
                      replaceText={t("catalog:modals.addStudio.step3.replace")}
                      removeText={t("catalog:modals.addStudio.step3.remove")}
                      previewAlt={t("catalog:modals.addStudio.step3.previewAlt")}
                    />
                  </div>

                  {/* Summary of previous steps */}
                  <div style={{
                    padding: "14px 16px",
                    background: "rgba(26,26,26,0.025)",
                    borderRadius: "14px",
                    border: "1.5px solid rgba(26,26,26,0.07)",
                  }}>
                    <p style={{ fontSize: "10px", fontWeight: 700, color: "#AAA", textTransform: "uppercase", letterSpacing: "0.5px", margin: "0 0 10px" }}>
                      {t("catalog:modals.addStudio.step3.summary")}
                    </p>
                    {[
                      { icon: <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#FCAE91" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>, label: data.name },
                      { icon: <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#FCAE91" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>, label: [data.city, data.country].filter(Boolean).join(", ") || "—" },
                      { icon: <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#FCAE91" strokeWidth="2"><path d="M3 12h18M3 6h18M3 18h18"/></svg>, label: data.address || "—" },
                    ].map((row, i) => (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: i < 2 ? "7px" : 0 }}>
                        {row.icon}
                        <span style={{ fontSize: "12px", color: "#555", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {row.label}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

            </div>
          </div>

          {/* ── ACTION BUTTONS ── */}
          <div style={{
            display: "flex", alignItems: "center", gap: "10px",
            marginTop: "20px", paddingTop: "16px",
            borderTop: "1px solid #F0EDE8",
            flexShrink: 0,
          }}>
            {step > 1 && (
              <button type="button" className="asm-back-btn" onClick={goBack} style={{
                padding: "12px 16px",
                background: "transparent", border: "1.5px solid #EEEBE6", borderRadius: "12px",
                fontSize: "13px", fontWeight: 600, color: "#888",
                cursor: "pointer", display: "flex", alignItems: "center", gap: "5px",
                fontFamily: "Manrope, sans-serif", transition: "all 0.15s", flexShrink: 0,
              }}>
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                  <path d="M10 12L6 8L10 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                {t("common:buttons.back")}
              </button>
            )}

            <button
              type="button"
              disabled={(step === 1 && !canStep1) || (step === 2 && !canStep2) || isSubmitting}
              onClick={step === 3 ? handleFinish : goNext}
              style={{
                flex: 1, padding: "13px 22px",
                background: step === 3
                  ? "linear-gradient(135deg, #A3C9A8, #7aab80)"
                  : "linear-gradient(135deg, #FCAE91, #F9A08B)",
                border: "none", borderRadius: "12px",
                fontSize: "14px", fontWeight: 700, color: "white",
                cursor: isSubmitting ? "not-allowed" : "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", gap: "7px",
                letterSpacing: "-0.1px",
                boxShadow: step === 3 ? "0 8px 24px rgba(163,201,168,0.35)" : "0 8px 24px rgba(252,174,145,0.32)",
                transition: "all 0.2s ease",
                fontFamily: "Manrope, sans-serif",
                opacity: ((step === 1 && !canStep1) || (step === 2 && !canStep2) || isSubmitting) ? 0.5 : 1,
              }}
            >
              {step === 3 ? (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                  {t("catalog:modals.addStudio.submit")}
                </>
              ) : (
                <>
                  {step === 2 ? t("catalog:modals.addStudio.nextPhoto") : t("common:buttons.continue")}
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                    <path d="M6 4L10 8L6 12" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </>
              )}
            </button>
          </div>

          {submitError && (
            <p style={{
              textAlign: "center", fontSize: "12px", fontWeight: 600,
              color: "#D88C9A", margin: "10px 0 0",
            }}>
              {submitError}
            </p>
          )}

          {step === 3 && (
            <p
              onClick={isSubmitting ? undefined : handleFinish}
              style={{
                textAlign: "center", fontSize: "11px", color: "#CCCCCC",
                margin: "8px 0 0", fontWeight: 500, cursor: "pointer",
                transition: "color 0.15s",
              }}
              onMouseEnter={e => (e.currentTarget.style.color = "#AAA")}
              onMouseLeave={e => (e.currentTarget.style.color = "#CCCCCC")}
            >
              {t("catalog:modals.addStudio.skipPhoto")}
            </p>
          )}
        </div>

      </div>
    </div>,
    document.body
  );
}
