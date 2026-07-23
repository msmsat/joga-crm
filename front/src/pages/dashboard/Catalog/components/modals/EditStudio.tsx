import { useState } from "react";
import { useTranslation } from "react-i18next";
import { isValidPhoneNumber } from "react-phone-number-input";
import "../../../../../App.css";
import { PhoneField, getCurrencySymbol } from "../../../../../components/UI";
import { ModalShell, ModalHeader, ModalBody, ModalFooter, GhostButton, PrimaryButton, Input, PhotoUpload, ChipsInput, ColorPicker, WorkingHoursEditor } from "../../../../../components/ui/modal";
import type { WorkingHour } from "../../../../../components/ui/modal";
import { useStudioCurrency } from "../../../../../hooks/useStudioCurrency";
import { useValidation } from "./useValidation";
import { studioApi } from "../../../../../api/studio/studio.api";
import { resolveImageUrl } from "../../../../../api/client";
import type { BranchDetail, BranchUpdate, HallBrief, HallCreate } from "../../../../../api/studio/studio.types";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

// Fallback, если у филиала ещё нет графика (бэкфилл не догнал): пн–пт 09:00–21:00, сб–вс закрыто.
function defaultWorkingHours(): WorkingHour[] {
  return Array.from({ length: 7 }, (_, d) => ({
    day_of_week: d,
    is_open: d < 5,
    open_time: "09:00",
    close_time: "21:00",
  }));
}

// ─── EDIT BRANCH ──────────────────────────────────────────────────────────────

interface EditBranchProps {
  branch: BranchDetail;
  onClose: () => void;
  onSubmit: (data: BranchUpdate) => Promise<void>;
}

export function EditStudioModal({ branch, onClose, onSubmit }: EditBranchProps) {
  const { t } = useTranslation(["catalog", "common"]);
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
    // На email-поле показываем и формат, и общий «нужен хотя бы один контакт».
    email: emailFilled && !emailValid
      ? t("common:validation.email")
      : (!contactOk ? t("common:validation.contactRequired") : null),
  };
  const { touch, show, hasErrors, trySubmit } = useValidation(errors);

  const previewSrc = photoPreview ?? resolveImageUrl(photoUrl) ?? null;

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

  const left = previewSrc ? (
    <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <img
        src={previewSrc}
        alt={branch.name}
        style={{ width: "100%", height: "100%", maxHeight: "460px", objectFit: "cover", borderRadius: "16px", boxShadow: "0 8px 24px rgba(26,26,26,0.10)" }}
      />
    </div>
  ) : (
    <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <BranchIllus name={name} />
    </div>
  );

  return (
    <ModalShell size="lg" onClose={onClose} left={left}>
      <ModalHeader title={t("catalog:modals.editBranch.title")} />
      <ModalBody>
        <Input label={t("catalog:modals.editBranch.name")} value={name} onChange={setName} onBlur={touch("name")} error={show("name")} placeholder={t("catalog:modals.editBranch.namePlaceholder")} />
        <PhoneField label={t("catalog:modals.editBranch.phone")} value={phone} onChange={(v: string | undefined) => { setPhone(v || ""); }} error={show("phone")} />
        <Input label={t("catalog:modals.editBranch.email")} type="email" value={email} onChange={setEmail} onBlur={touch("email")} error={show("email")} placeholder={t("catalog:modals.editBranch.emailPlaceholder")} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
          <Input label={t("catalog:modals.editBranch.country")} value={country} onChange={setCountry} placeholder={t("catalog:modals.editBranch.countryPlaceholder")} />
          <Input label={t("catalog:modals.editBranch.city")} value={city} onChange={setCity} placeholder={t("catalog:modals.editBranch.cityPlaceholder")} />
        </div>
        <Input label={t("catalog:modals.editBranch.address")} value={address} onChange={setAddress} placeholder={t("catalog:modals.editBranch.addressPlaceholder")} />
        <div>
          <label style={{ display: "block", fontSize: "11px", fontWeight: 700, color: "#999", letterSpacing: "0.6px", textTransform: "uppercase", marginBottom: "7px" }}>
            {t("catalog:modals.editBranch.photo")}
          </label>
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
        <div>
          <label style={{ display: "block", fontSize: "11px", fontWeight: 700, color: "#999", letterSpacing: "0.6px", textTransform: "uppercase", marginBottom: "7px" }}>
            {t("catalog:modals.editBranch.workingHours")}
          </label>
          <WorkingHoursEditor
            value={workingHours}
            onChange={v => { setWorkingHours(v); setHoursDirty(true); }}
            dayLabels={DAY_KEYS.map(k => t(`common:days.${k}`))}
          />
        </div>
      </ModalBody>
      <ModalFooter>
        <GhostButton>{t("common:buttons.cancel")}</GhostButton>
        <PrimaryButton onClick={handleSave} disabled={hasErrors} loading={saving}>{t("common:buttons.save")}</PrimaryButton>
      </ModalFooter>
    </ModalShell>
  );
}

// Иллюстрация-заглушка для левой панели при отсутствии фото (стиль Illus1 из визарда).
function BranchIllus({ name }: { name: string }) {
  const hasName = name.trim().length >= 2;
  return (
    <svg viewBox="0 0 260 240" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: "100%", maxWidth: 240 }}>
      <defs>
        <radialGradient id="eb-bg" cx="50%" cy="50%" r="50%">
          <stop stopColor="rgba(252,174,145,0.12)" /><stop offset="1" stopColor="rgba(252,174,145,0)" />
        </radialGradient>
        <linearGradient id="eb-accent" x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#FCAE91" /><stop offset="1" stopColor="#F07B60" />
        </linearGradient>
        <filter id="eb-shadow"><feDropShadow dx="0" dy="8" stdDeviation="16" floodColor="rgba(26,26,26,0.10)" /></filter>
      </defs>
      <ellipse cx="130" cy="120" rx="90" ry="80" fill="url(#eb-bg)" />
      <rect x="32" y="52" width="196" height="136" rx="20" fill="white" filter="url(#eb-shadow)" stroke="#F0EDE8" strokeWidth="1" />
      <rect x="108" y="74" width="44" height="36" rx="4" fill={hasName ? "url(#eb-accent)" : "rgba(26,26,26,0.06)"} />
      <rect x="118" y="86" width="8" height="8" rx="1.5" fill="rgba(255,255,255,0.7)" />
      <rect x="134" y="86" width="8" height="8" rx="1.5" fill="rgba(255,255,255,0.7)" />
      <rect x="122" y="98" width="16" height="12" rx="2" fill="rgba(255,255,255,0.5)" />
      <path d="M104 76 L130 60 L156 76" stroke={hasName ? "#F07B60" : "#DDD"} strokeWidth="2" strokeLinejoin="round" fill="none" />
      {hasName ? (
        <text x="130" y="140" textAnchor="middle" fontSize="12" fontWeight="700" fill="#1A1A1A" fontFamily="Manrope, sans-serif">
          {name.length > 20 ? name.slice(0, 20) + "…" : name}
        </text>
      ) : (
        <rect x="84" y="132" width="92" height="8" rx="4" fill="rgba(26,26,26,0.07)" />
      )}
      <rect x="88" y="156" width="84" height="6" rx="3" fill="rgba(26,26,26,0.04)" />
    </svg>
  );
}

// ─── HALL FORM (create + edit) ────────────────────────────────────────────────

interface HallModalProps {
  hall: HallBrief | null; // null → создание
  onClose: () => void;
  // Форма всегда даёт полный набор с обязательным name → HallCreate.
  // При редактировании он же присваивается HallUpdate (name становится опциональным).
  onSubmit: (data: HallCreate) => Promise<void>;
}

export function HallModal({ hall, onClose, onSubmit }: HallModalProps) {
  const { t } = useTranslation(["catalog", "common"]);
  // Компонент пересоздаётся по key при каждом открытии (см. родителя),
  // поэтому начальные значения из hall корректны без useEffect-синхронизации.
  const [name, setName] = useState(hall?.name ?? "");
  const [capacity, setCapacity] = useState(hall != null ? String(hall.capacity) : "20");
  const [area, setArea] = useState(hall?.area != null ? String(hall.area) : "");
  const [color, setColor] = useState(hall?.color ?? "#FCAE91");
  const [hourlyRate, setHourlyRate] = useState(hall?.hourly_rate != null ? String(hall.hourly_rate) : "");
  const [equipment, setEquipment] = useState<string[]>(hall?.equipment ?? []);
  // Фикс: онлайн-статус стартовал жёстким false и молча выключался при каждом сохранении.
  const [isOnline, setIsOnline] = useState(hall?.is_online ?? false);
  const [photoUrl, setPhotoUrl] = useState<string | null>(hall?.photo_url ?? null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const studioCurrency = useStudioCurrency();
  const currency = getCurrencySymbol(studioCurrency);
  const previewSrc = photoPreview ?? resolveImageUrl(photoUrl) ?? null;

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

  const errors = {
    name: name.trim().length < 1 ? t("common:validation.required") : null,
    capacity: Number(capacity) >= 1 ? null : t("common:validation.min", { n: 1 }),
    area: area.trim() && Number(area) < 0 ? t("common:validation.min", { n: 0 }) : null,
    hourlyRate: hourlyRate.trim() && Number(hourlyRate) < 0 ? t("common:validation.min", { n: 0 }) : null,
  };
  const { touch, show, hasErrors, trySubmit } = useValidation(errors);

  async function handleSave() {
    if (!trySubmit() || saving) return;
    setSaving(true);
    try {
      let nextPhotoUrl = photoUrl;
      if (photoFile) {
        nextPhotoUrl = (await studioApi.uploadHallPhoto(photoFile)).url;
      }
      await onSubmit({
        name: name.trim(),
        capacity: Number(capacity) || 0,
        area: area.trim() ? Number(area) : null,
        color: color || null,
        hourly_rate: hourlyRate.trim() ? Number(hourlyRate) : null,
        equipment: equipment.length ? equipment : null,
        is_online: isOnline,
        photo_url: nextPhotoUrl,
      });
      onClose();
    } catch {
      // тост показывает родитель
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell size="sm" onClose={onClose}>
      <ModalHeader title={hall ? t("catalog:modals.hall.titleEdit") : t("catalog:modals.hall.titleNew")} />
      <ModalBody>
        <Input label={t("catalog:modals.hall.name")} value={name} onChange={setName} onBlur={touch("name")} error={show("name")} placeholder={t("catalog:modals.hall.namePlaceholder")} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
          <Input label={t("catalog:modals.hall.capacity")} type="number" value={capacity} onChange={setCapacity} onBlur={touch("capacity")} error={show("capacity")} placeholder="20" />
          <Input label={t("catalog:modals.hall.area")} type="number" value={area} onChange={setArea} onBlur={touch("area")} error={show("area")} placeholder="45" />
        </div>
        <Input label={t("catalog:modals.hall.hourlyRate", { currency })} type="number" value={hourlyRate} onChange={setHourlyRate} onBlur={touch("hourlyRate")} error={show("hourlyRate")} placeholder={t("catalog:modals.hall.hourlyRatePlaceholder")} />
        <ChipsInput label={t("catalog:modals.hall.equipment")} value={equipment} onChange={setEquipment} placeholder={t("catalog:modals.hall.equipmentPlaceholder")} />
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <ColorPicker label={t("catalog:modals.hall.color")} value={color} onChange={setColor} />
          <label style={{ display: "flex", alignItems: "center", gap: "7px", marginLeft: "auto", fontSize: "13px", color: "#555", cursor: "pointer" }}>
            <input type="checkbox" checked={isOnline} onChange={e => setIsOnline(e.target.checked)} />
            {t("catalog:modals.hall.isOnline")}
          </label>
        </div>
        <div>
          <label style={{ display: "block", fontSize: "11px", fontWeight: 700, color: "#999", letterSpacing: "0.6px", textTransform: "uppercase", marginBottom: "7px" }}>
            {t("catalog:modals.hall.photo")}
          </label>
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
      </ModalBody>
      <ModalFooter>
        <GhostButton>{t("common:buttons.cancel")}</GhostButton>
        <PrimaryButton onClick={handleSave} disabled={hasErrors} loading={saving}>{hall ? t("common:buttons.save") : t("common:buttons.create")}</PrimaryButton>
      </ModalFooter>
    </ModalShell>
  );
}
