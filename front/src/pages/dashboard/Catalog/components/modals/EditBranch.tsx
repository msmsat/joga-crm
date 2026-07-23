import { useState } from "react";
import { useTranslation } from "react-i18next";
import { isValidPhoneNumber } from "react-phone-number-input";
import "../../../../../App.css";
import { PhoneField, getCurrencySymbol } from "../../../../../components/UI";
import {
  ModalShell,
  ModalHeader,
  ModalBody,
  ModalFooter,
  GhostButton,
  PrimaryButton,
  Input,
  PhotoUpload,
  WorkingHoursEditor,
} from "../../../../../components/ui/modal";
import type { WorkingHour } from "../../../../../components/ui/modal";
import { useStudioCurrency } from "../../../../../hooks/useStudioCurrency";
import { useValidation } from "./useValidation";
import { studioApi } from "../../../../../api/studio/studio.api";
import { resolveImageUrl } from "../../../../../api/client";
import type { BranchDetail, BranchUpdate } from "../../../../../api/studio/studio.types";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

function defaultWorkingHours(): WorkingHour[] {
  return Array.from({ length: 7 }, (_, d) => ({
    day_of_week: d,
    is_open: d < 5,
    open_time: "09:00",
    close_time: "21:00",
  }));
}

interface EditBranchModalProps {
  branch: BranchDetail;
  onClose: () => void;
  onSubmit: (data: BranchUpdate) => Promise<void>;
  onDelete?: () => void;
}

export function EditBranchModal({ branch, onClose, onSubmit, onDelete }: EditBranchModalProps) {
  const { t } = useTranslation(["catalog", "common"]);
  const studioCurrency = useStudioCurrency();
  const currency = getCurrencySymbol(studioCurrency);

  const [name, setName] = useState(branch.name);
  const [phone, setPhone] = useState(branch.phone ?? "");
  const [email, setEmail] = useState(branch.email ?? "");
  const [country, setCountry] = useState(branch.country ?? "");
  const [city, setCity] = useState(branch.city ?? "");
  const [address, setAddress] = useState(branch.address ?? "");
  const [photoUrl, setPhotoUrl] = useState<string | null>(branch.photo_url);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [workingHours, setWorkingHours] = useState<WorkingHour[]>(
    branch.working_hours.length === 7 ? branch.working_hours : defaultWorkingHours()
  );
  const [hoursDirty, setHoursDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  const phoneFilled = phone.trim().length > 0;
  const emailFilled = email.trim().length > 0;
  const phoneValid = phoneFilled && isValidPhoneNumber(phone);
  const emailValid = emailFilled && EMAIL_RE.test(email.trim());
  const contactOk = phoneValid || emailValid;

  const errors = {
    name: name.trim().length < 2 ? t("common:validation.minLength", { n: 2 }) : null,
    phone: phoneFilled && !phoneValid ? t("common:validation.phone") : null,
    email: emailFilled && !emailValid
      ? t("common:validation.email")
      : (!contactOk ? t("common:validation.contactRequired") : null),
  };
  const { touch, show, trySubmit } = useValidation(errors);

  const previewSrc = photoPreview ?? resolveImageUrl(photoUrl) ?? null;

  const halls = branch.halls ?? [];
  const totalSeats = halls.reduce((sum, h) => sum + (h.capacity ?? 0), 0);
  const rates = halls.map(h => h.hourly_rate).filter((r): r is number => r != null);
  const minRate = rates.length ? Math.min(...rates) : null;
  const openDays = workingHours.filter(w => w.is_open).length;

  const completenessFields = [name.trim(), phone.trim() || email.trim(), country.trim(), city.trim(), address.trim(), previewSrc];
  const completeness = Math.round((completenessFields.filter(Boolean).length / completenessFields.length) * 100);

  // Сравниваем текущие значения с тем, что пришло из базы
  const isDirty =
    name !== branch.name ||
    phone !== (branch.phone ?? "") ||
    email !== (branch.email ?? "") ||
    country !== (branch.country ?? "") ||
    city !== (branch.city ?? "") ||
    address !== (branch.address ?? "") ||
    photoFile !== null ||
    photoUrl !== branch.photo_url ||
    hoursDirty;

  function pickPhoto(file: File) {
    setPhotoFile(file);
    const reader = new FileReader();
    reader.onload = ev => setPhotoPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  }

  function removePhoto() {
    setPhotoFile(null);
    setPhotoPreview(null);
    setPhotoUrl(null);
  }

  async function handleSave() {
    if (!trySubmit() || saving) return;
    setSaving(true);
    try {
      let nextPhotoUrl = photoUrl;
      if (photoFile) {
        nextPhotoUrl = (await studioApi.uploadBranchPhoto(photoFile)).url;
      }
      await onSubmit({
        name: name.trim(),
        phone: phone.trim() || null,
        email: email.trim() || null,
        country: country.trim() || null,
        city: city.trim() || null,
        address: address.trim() || null,
        photo_url: nextPhotoUrl,
        ...(hoursDirty ? { working_hours: workingHours } : {}),
      });
      onClose();
    } catch {
      // тост показывает родитель
    } finally {
      setSaving(false);
    }
  }

  // ВАЖНО: Фиксированная ширина левой колонки, чтобы она не разъезжалась
  const left = (
    <div style={{ width: "100%", maxWidth: "340px", margin: "auto", display: "flex", flexDirection: "column", padding: "16px" }}>
      <BranchHero
        photoSrc={previewSrc}
        name={name}
        city={city}
        country={country}
      />
      <div className="ebh-stats-row">
        <StatPill icon={<IconDoor />} value={halls.length} label={t("catalog:studios.stats.halls", { defaultValue: "Залов" })} />
        <StatPill icon={<IconUsers />} value={totalSeats} label={t("catalog:studios.stats.totalSeats", { defaultValue: "Мест" })} />
        <StatPill
          icon={<IconTag />}
          value={minRate != null ? `${currency}${minRate.toLocaleString()}` : "—"}
          label={t("catalog:studios.stats.fromPerHour", { defaultValue: "От / час" })}
        />
        <StatPill icon={<IconCalendar />} value={openDays} label={t("catalog:modals.editBranch.openDays", { defaultValue: "Дней открыто" })} />
      </div>
      <div className="ebh-completeness">
        <div className="ebh-completeness-top">
          <span>{t("catalog:modals.editBranch.profileFilled", { defaultValue: "Заполненность профиля" })}</span>
          <span className="ebh-completeness-pct">{completeness}%</span>
        </div>
        <div className="ebh-completeness-track">
          <div className="ebh-completeness-fill" style={{ width: `${completeness}%` }} />
        </div>
      </div>
    </div>
  );

  return (
    <ModalShell size="lg" onClose={onClose} left={left}>
      <ModalHeader title={t("catalog:modals.editBranch.title")} />
      <ModalBody>
        {/* ВАЖНО: Скроллируемый контейнер внутри ModalBody */}
        <div className="ebh-scrollable-form">
          <SectionLabel icon={<IconInfo />} text={t("catalog:modals.editBranch.sectionBasic", { defaultValue: "Основное" })} delay={0} />
          <div className="ebh-anim" style={{ animationDelay: "40ms" }}>
            <Input
              label={t("catalog:modals.editBranch.name")}
              value={name}
              onChange={setName}
              onBlur={touch("name")}
              error={show("name")}
              placeholder={t("catalog:modals.editBranch.namePlaceholder")}
            />
          </div>

          <SectionLabel icon={<IconPhone />} text={t("catalog:modals.editBranch.sectionContacts", { defaultValue: "Контакты" })} delay={80} />
          <div className="ebh-anim" style={{ animationDelay: "100ms", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <PhoneField
              label={t("catalog:modals.editBranch.phone")}
              value={phone}
              onChange={(v: string | undefined) => { setPhone(v || ""); }}
              error={show("phone")}
            />
            <Input
              label={t("catalog:modals.editBranch.email")}
              type="email"
              value={email}
              onChange={setEmail}
              onBlur={touch("email")}
              error={show("email")}
              placeholder={t("catalog:modals.editBranch.emailPlaceholder")}
            />
          </div>

          <SectionLabel icon={<IconPin />} text={t("catalog:modals.editBranch.sectionLocation", { defaultValue: "Локация" })} delay={140} />
          <div className="ebh-anim" style={{ animationDelay: "160ms" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              <Input label={t("catalog:modals.editBranch.country")} value={country} onChange={setCountry} placeholder={t("catalog:modals.editBranch.countryPlaceholder")} />
              <Input label={t("catalog:modals.editBranch.city")} value={city} onChange={setCity} placeholder={t("catalog:modals.editBranch.cityPlaceholder")} />
            </div>
            <Input label={t("catalog:modals.editBranch.address")} value={address} onChange={setAddress} placeholder={t("catalog:modals.editBranch.addressPlaceholder")} />
          </div>

          <SectionLabel icon={<IconPhoto />} text={t("catalog:modals.editBranch.photo")} delay={200} />
          <div className="ebh-anim" style={{ animationDelay: "220ms" }}>
            <PhotoUpload
              preview={previewSrc}
              onFile={pickPhoto}
              onRemove={removePhoto}
              ctaText={t("catalog:modals.addStudio.step3.uploadCta")}
              hintText={t("catalog:modals.addStudio.step3.uploadHint")}
              replaceText={t("catalog:modals.addStudio.step3.replace")}
              removeText={t("catalog:modals.addStudio.step3.remove")}
              previewAlt={t("catalog:modals.addStudio.step3.previewAlt")}
            />
          </div>

          <SectionLabel icon={<IconClock />} text={t("catalog:modals.editBranch.workingHours")} delay={260} />
          <div className="ebh-anim" style={{ animationDelay: "280ms" }}>
            <WorkingHoursEditor
              value={workingHours}
              onChange={v => { setWorkingHours(v); setHoursDirty(true); }}
              dayLabels={DAY_KEYS.map(k => t(`common:days.${k}`))}
            />
          </div>

          {onDelete && (
            <div className="ebh-danger-zone ebh-anim" style={{ animationDelay: "320ms" }}>
              <div>
                <div className="ebh-danger-title">{t("catalog:modals.editBranch.dangerTitle", { defaultValue: "Опасная зона" })}</div>
                <div className="ebh-danger-sub">
                  {t("catalog:modals.editBranch.dangerSub", { defaultValue: "Удаление нельзя отменить." })}
                </div>
              </div>
              <button type="button" className="ebh-danger-btn" onClick={onDelete}>
                <IconTrash />
                {t("catalog:studios.deleteBranch")}
              </button>
            </div>
          )}
        </div>
      </ModalBody>
      <ModalFooter>
        <GhostButton onClick={onClose}>{t("common:buttons.cancel")}</GhostButton>
        <PrimaryButton 
          onClick={handleSave} 
          disabled={!isDirty} 
          loading={saving}
        >
          {t("common:buttons.save")}
        </PrimaryButton>
      </ModalFooter>
      <BranchStyles />
    </ModalShell>
  );
}

// ─── HERO ILLUSTRATION ─────────────────────────────────────────────────────

function BranchHero({ photoSrc, name, city, country }: { photoSrc: string | null; name: string; city: string; country: string }) {
  const hasName = name.trim().length >= 2;
  const locationLabel = [city.trim(), country.trim()].filter(Boolean).join(", ");

  if (photoSrc) {
    return (
      <div className="ebh-hero ebh-hero-photo">
        <img src={photoSrc} alt={name} className="ebh-hero-img" />
        <div className="ebh-hero-scrim" />
        <div className="ebh-hero-caption">
          <div className="ebh-hero-name">{name || "—"}</div>
          {locationLabel && <div className="ebh-hero-loc">{locationLabel}</div>}
        </div>
      </div>
    );
  }

  return (
    <div className="ebh-hero">
      <svg viewBox="0 0 340 280" fill="none" xmlns="http://www.w3.org/2000/svg" className="ebh-svg">
        <defs>
          <radialGradient id="ebh-glow" cx="50%" cy="42%" r="55%">
            <stop stopColor="rgba(252,174,145,0.28)" />
            <stop offset="1" stopColor="rgba(252,174,145,0)" />
          </radialGradient>
          <linearGradient id="ebh-accent" x1="0" y1="0" x2="1" y2="1">
            <stop stopColor="#FCAE91" />
            <stop offset="1" stopColor="#F07B60" />
          </linearGradient>
          <filter id="ebh-shadow" x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="0" dy="10" stdDeviation="18" floodColor="rgba(26,26,26,0.12)" />
          </filter>
        </defs>

        <circle className="ebh-glow-pulse" cx="170" cy="118" r="120" fill="url(#ebh-glow)" />

        <circle className="ebh-float-1" cx="58" cy="70" r="5" fill="#FCAE91" opacity="0.5" />
        <circle className="ebh-float-2" cx="288" cy="96" r="4" fill="#1A1A1A" opacity="0.12" />
        <circle className="ebh-float-3" cx="270" cy="200" r="6" fill="#FCAE91" opacity="0.35" />
        <rect className="ebh-float-2" x="46" y="196" width="9" height="9" rx="2" fill="#1A1A1A" opacity="0.08" transform="rotate(18 50 200)" />

        <rect x="70" y="100" width="200" height="140" rx="22" fill="white" filter="url(#ebh-shadow)" stroke="#F0EDE8" strokeWidth="1" />

        <path
          className="ebh-draw"
          d="M62 104 L170 44 L278 104"
          stroke={hasName ? "#F07B60" : "#DDDDDD"}
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />

        <rect x="146" y="150" width="48" height="90" rx="6" fill={hasName ? "url(#ebh-accent)" : "rgba(26,26,26,0.06)"} />
        <circle cx="182" cy="196" r="2.6" fill="rgba(255,255,255,0.85)" />

        <rect x="90" y="128" width="34" height="28" rx="5" fill="rgba(252,174,145,0.22)" stroke="#FCAE91" strokeWidth="1.5" />
        <rect x="216" y="128" width="34" height="28" rx="5" fill="rgba(252,174,145,0.22)" stroke="#FCAE91" strokeWidth="1.5" />
        <rect x="90" y="170" width="34" height="24" rx="5" fill="rgba(26,26,26,0.04)" stroke="#EEE" strokeWidth="1.5" />
        <rect x="216" y="170" width="34" height="24" rx="5" fill="rgba(26,26,26,0.04)" stroke="#EEE" strokeWidth="1.5" />

        {hasName ? (
          <text x="170" y="262" textAnchor="middle" fontSize="13" fontWeight="700" fill="#1A1A1A" fontFamily="Manrope, sans-serif">
            {name.length > 26 ? name.slice(0, 26) + "…" : name}
          </text>
        ) : (
          <rect x="120" y="254" width="100" height="8" rx="4" fill="rgba(26,26,26,0.07)" />
        )}
      </svg>
      {locationLabel && <div className="ebh-illus-loc">{locationLabel}</div>}
    </div>
  );
}

function BranchStyles() {
  return (
    <style>{`
      /* Ограничиваем высоту формы и делаем красивый скролл */
      .ebh-scrollable-form {
        max-height: 60vh;
        overflow-y: auto;
        overflow-x: hidden;
        padding-right: 12px;
        margin-right: -12px;
      }
      .ebh-scrollable-form::-webkit-scrollbar { width: 4px; }
      .ebh-scrollable-form::-webkit-scrollbar-track { background: transparent; }
      .ebh-scrollable-form::-webkit-scrollbar-thumb { background: #D9D9D9; border-radius: 4px; }
      .ebh-scrollable-form::-webkit-scrollbar-thumb:hover { background: #BFBFBF; }

      .ebh-hero {
        position: relative;
        width: 100%;
        height: 220px; /* Фиксированная высота для SVG */
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        border-radius: 16px;
        overflow: hidden;
        flex-shrink: 0;
      }
      .ebh-hero-photo { height: 260px; /* Чуть повыше для реального фото */ }
      .ebh-hero-img { width: 100%; height: 100%; object-fit: cover; position: absolute; inset: 0; }
      .ebh-hero-scrim {
        position: absolute; inset: 0;
        background: linear-gradient(180deg, rgba(0,0,0,0) 45%, rgba(26,26,26,0.6) 100%);
      }
      .ebh-hero-caption { position: relative; align-self: flex-start; margin-top: auto; padding: 16px; color: #fff; }
      .ebh-hero-name { font-size: 16px; font-weight: 800; }
      .ebh-hero-loc { font-size: 12px; opacity: 0.85; margin-top: 2px; }

      .ebh-svg { width: 100%; max-width: 260px; }
      .ebh-illus-loc { font-size: 12px; color: #999; font-weight: 600; margin-top: 6px; }

      .ebh-glow-pulse { animation: ebhPulse 3.6s ease-in-out infinite; transform-origin: 170px 118px; }
      @keyframes ebhPulse {
        0%, 100% { opacity: 0.7; transform: scale(1); }
        50% { opacity: 1; transform: scale(1.06); }
      }

      .ebh-float-1 { animation: ebhFloat 4.2s ease-in-out infinite; }
      .ebh-float-2 { animation: ebhFloat 5.1s ease-in-out infinite 0.4s; }
      .ebh-float-3 { animation: ebhFloat 3.6s ease-in-out infinite 0.8s; }
      @keyframes ebhFloat {
        0%, 100% { transform: translateY(0); }
        50% { transform: translateY(-8px); }
      }

      .ebh-draw {
        stroke-dasharray: 260;
        stroke-dashoffset: 260;
        animation: ebhDraw 1.1s cubic-bezier(0.22, 1, 0.36, 1) forwards 0.15s;
      }
      @keyframes ebhDraw {
        to { stroke-dashoffset: 0; }
      }

      .ebh-stats-row {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 8px;
        margin-top: 16px;
      }
      .ebh-stat-pill {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 3px;
        padding: 10px 4px;
        background: rgba(252,174,145,0.08);
        border: 1px solid rgba(252,174,145,0.18);
        border-radius: 12px;
        animation: ebhFadeUp 0.5s cubic-bezier(0.22, 1, 0.36, 1) both;
      }
      .ebh-stat-pill svg { color: #F07B60; }
      .ebh-stat-v { font-size: 13px; font-weight: 800; color: #1A1A1A; line-height: 1; }
      .ebh-stat-l { font-size: 9px; font-weight: 700; color: #AAAAAA; text-transform: uppercase; letter-spacing: 0.4px; text-align: center; }

      .ebh-completeness { margin-top: 16px; }
      .ebh-completeness-top {
        display: flex; justify-content: space-between; align-items: center;
        font-size: 11px; font-weight: 700; color: #999; margin-bottom: 6px;
      }
      .ebh-completeness-pct { color: #F07B60; }
      .ebh-completeness-track {
        height: 6px; width: 100%; background: rgba(26,26,26,0.06); border-radius: 999px; overflow: hidden;
      }
      .ebh-completeness-fill {
        height: 100%; border-radius: 999px;
        background: linear-gradient(90deg, #FCAE91, #F07B60);
        transition: width 0.45s cubic-bezier(0.22, 1, 0.36, 1);
      }

      .ebh-section-label {
        display: flex; align-items: center; gap: 7px;
        font-size: 11px; font-weight: 700; color: #999;
        letter-spacing: 0.6px; text-transform: uppercase;
        margin: 18px 0 8px;
        animation: ebhFadeUp 0.45s cubic-bezier(0.22, 1, 0.36, 1) both;
      }
      .ebh-section-label:first-child { margin-top: 2px; }
      .ebh-section-label svg { color: #FCAE91; flex-shrink: 0; }

      .ebh-anim { animation: ebhFadeUp 0.45s cubic-bezier(0.22, 1, 0.36, 1) both; }
      @keyframes ebhFadeUp {
        from { opacity: 0; transform: translateY(6px); }
        to { opacity: 1; transform: translateY(0); }
      }

      .ebh-danger-zone {
        margin-top: 24px; margin-bottom: 8px;
        display: flex; align-items: center; justify-content: space-between; gap: 12px;
        padding: 14px 16px;
        border: 1px solid rgba(224,80,80,0.22);
        background: rgba(224,80,80,0.05);
        border-radius: 14px;
      }
      .ebh-danger-title { font-size: 13px; font-weight: 700; color: #C43D3D; }
      .ebh-danger-sub { font-size: 11.5px; color: #B57C7C; margin-top: 2px; }
      .ebh-danger-btn {
        display: flex; align-items: center; gap: 6px; flex-shrink: 0;
        padding: 9px 14px; border-radius: 10px; border: 1px solid rgba(224,80,80,0.3);
        background: #fff; color: #C43D3D; font-size: 12.5px; font-weight: 700;
        cursor: pointer; transition: background 0.15s ease, transform 0.15s ease;
      }
      .ebh-danger-btn:hover { background: rgba(224,80,80,0.08); transform: translateY(-1px); }
    `}</style>
  );
}

function SectionLabel({ icon, text, delay }: { icon: React.ReactNode; text: string; delay: number }) {
  return (
    <div className="ebh-section-label" style={{ animationDelay: `${delay}ms` }}>
      {icon}
      {text}
    </div>
  );
}

function StatPill({ icon, value, label }: { icon: React.ReactNode; value: string | number; label: string }) {
  return (
    <div className="ebh-stat-pill">
      {icon}
      <div className="ebh-stat-v">{value}</div>
      <div className="ebh-stat-l">{label}</div>
    </div>
  );
}

function IconDoor() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 21h18" /><path d="M6 21V6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v15" /><path d="M14 12v.01" /></svg>; }
function IconUsers() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>; }
function IconTag() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M20.59 13.41 13.42 20.6a2 2 0 0 1-2.83 0L2.7 12.71a2 2 0 0 1-.58-1.42V4a1 1 0 0 1 1-1h7.29a2 2 0 0 1 1.42.58l8.16 8.17a2 2 0 0 1 0 2.83Z" /><circle cx="7.5" cy="7.5" r="1.2" /></svg>; }
function IconCalendar() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4" /><path d="M8 2v4" /><path d="M3 10h18" /></svg>; }
function IconInfo() { return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" /></svg>; }
function IconPhone() { return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.99 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.92 1h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 8.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" /></svg>; }
function IconPin() { return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>; }
function IconPhoto() { return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="M21 15l-5-5L5 21" /></svg>; }
function IconClock() { return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>; }
function IconTrash() { return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" /></svg>; }