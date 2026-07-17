import { useState } from "react";
import { createPortal } from "react-dom";
import "../../../../../App.css";
import { InputField, PhoneField } from "../../../../../components/UI";
import type { BranchDetail, BranchUpdate, HallBrief, HallCreate } from "../../../../../api/studio/studio.types";

// ─── SHARED SHELL ─────────────────────────────────────────────────────────────

function ModalShell({ title, onClose, children, footer }: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  return createPortal(
    <div
      style={{
        position: "fixed", inset: 0, background: "rgba(26,26,26,0.42)",
        backdropFilter: "blur(10px)", display: "flex", alignItems: "center",
        justifyContent: "center", zIndex: 1000, padding: "16px",
        animation: "overlayIn 0.22s ease",
      }}
      onClick={onClose}
    >
      <style>{`
        @keyframes overlayIn { from { opacity:0 } to { opacity:1 } }
        @keyframes modalIn { from { opacity:0; transform: scale(0.94) translateY(16px) } to { opacity:1; transform: scale(1) translateY(0) } }
      `}</style>
      <div
        style={{
          width: "100%", maxWidth: "460px", maxHeight: "calc(100vh - 32px)",
          background: "#FDFCFB", borderRadius: "20px",
          boxShadow: "0 40px 100px rgba(26,26,26,0.18), 0 8px 32px rgba(26,26,26,0.07)",
          display: "flex", flexDirection: "column", overflow: "hidden",
          animation: "modalIn 0.32s cubic-bezier(0.34,1.1,0.64,1)",
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "22px 24px 16px", borderBottom: "1px solid #F0EDE8",
        }}>
          <h2 style={{ fontSize: "18px", fontWeight: 900, color: "#1A1A1A", letterSpacing: "-0.5px", margin: 0 }}>
            {title}
          </h2>
          <button
            onClick={onClose}
            style={{
              width: "28px", height: "28px", background: "rgba(26,26,26,0.05)",
              border: "none", borderRadius: "8px", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", color: "#AAA",
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div style={{ padding: "20px 24px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "16px" }}>
          {children}
        </div>
        <div style={{
          display: "flex", gap: "10px", padding: "16px 24px",
          borderTop: "1px solid #F0EDE8",
        }}>
          {footer}
        </div>
      </div>
    </div>,
    document.body
  );
}

function PrimaryButton({ onClick, disabled, children }: { onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        flex: 1, padding: "12px 20px",
        background: "linear-gradient(135deg, #FCAE91, #F9A08B)",
        border: "none", borderRadius: "12px",
        fontSize: "14px", fontWeight: 700, color: "white",
        cursor: disabled ? "not-allowed" : "pointer",
        fontFamily: "Manrope, sans-serif", opacity: disabled ? 0.5 : 1,
        boxShadow: "0 8px 24px rgba(252,174,145,0.3)",
      }}
    >
      {children}
    </button>
  );
}

function GhostButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "12px 18px", background: "transparent",
        border: "1.5px solid #EEEBE6", borderRadius: "12px",
        fontSize: "13px", fontWeight: 600, color: "#888",
        cursor: "pointer", fontFamily: "Manrope, sans-serif",
      }}
    >
      {children}
    </button>
  );
}

// ─── EDIT BRANCH ──────────────────────────────────────────────────────────────

interface EditBranchProps {
  branch: BranchDetail;
  onClose: () => void;
  onSubmit: (data: BranchUpdate) => Promise<void>;
}

export function EditStudioModal({ branch, onClose, onSubmit }: EditBranchProps) {
  const [name, setName] = useState(branch.name);
  const [phone, setPhone] = useState(branch.phone ?? "");
  const [email, setEmail] = useState(branch.email ?? "");
  const [city, setCity] = useState(branch.city ?? "");
  const [address, setAddress] = useState(branch.address ?? "");
  const [saving, setSaving] = useState(false);

  const canSave = name.trim().length >= 2 && !saving;

  async function handleSave() {
    if (!canSave) return;
    setSaving(true);
    try {
      await onSubmit({
        name: name.trim(),
        phone: phone.trim() || null,
        email: email.trim() || null,
        city: city.trim() || null,
        address: address.trim() || null,
      });
      onClose();
    } catch {
      // тост показывает родитель
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell
      title="Редактировать филиал"
      onClose={onClose}
      footer={<><GhostButton onClick={onClose}>Отмена</GhostButton><PrimaryButton onClick={handleSave} disabled={!canSave}>Сохранить</PrimaryButton></>}
    >
      <InputField label="Название филиала" value={name} onChange={setName} placeholder="Velora Studio" />
      <PhoneField label="Телефон" value={phone} onChange={(v: string | undefined) => setPhone(v || "")} />
      <InputField label="Email" type="email" value={email} onChange={setEmail} placeholder="studio@velora.ru" />
      <InputField label="Город" value={city} onChange={setCity} placeholder="Москва" />
      <InputField label="Адрес" value={address} onChange={setAddress} placeholder="ул. Тверская, д. 12" />
    </ModalShell>
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
  // Компонент пересоздаётся по key при каждом открытии (см. родителя),
  // поэтому начальные значения из hall корректны без useEffect-синхронизации.
  const [name, setName] = useState(hall?.name ?? "");
  const [capacity, setCapacity] = useState(hall != null ? String(hall.capacity) : "20");
  const [area, setArea] = useState(hall?.area != null ? String(hall.area) : "");
  const [color, setColor] = useState(hall?.color ?? "#FCAE91");
  const [hourlyRate, setHourlyRate] = useState(hall?.hourly_rate != null ? String(hall.hourly_rate) : "");
  const [equipment, setEquipment] = useState((hall?.equipment ?? []).join(", "));
  const [isOnline, setIsOnline] = useState(false);
  const [saving, setSaving] = useState(false);

  const canSave = name.trim().length >= 1 && !saving;

  async function handleSave() {
    if (!canSave) return;
    setSaving(true);
    const equipmentList = equipment.split(",").map(e => e.trim()).filter(Boolean);
    try {
      await onSubmit({
        name: name.trim(),
        capacity: Number(capacity) || 0,
        area: area.trim() ? Number(area) : null,
        color: color || null,
        hourly_rate: hourlyRate.trim() ? Number(hourlyRate) : null,
        equipment: equipmentList.length ? equipmentList : null,
        is_online: isOnline,
      });
      onClose();
    } catch {
      // тост показывает родитель
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell
      title={hall ? "Редактировать зал" : "Новый зал"}
      onClose={onClose}
      footer={<><GhostButton onClick={onClose}>Отмена</GhostButton><PrimaryButton onClick={handleSave} disabled={!canSave}>{hall ? "Сохранить" : "Создать"}</PrimaryButton></>}
    >
      <InputField label="Название зала" value={name} onChange={setName} placeholder="Зал А" />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
        <InputField label="Вместимость" type="number" value={capacity} onChange={setCapacity} placeholder="20" />
        <InputField label="Площадь, м²" type="number" value={area} onChange={setArea} placeholder="45" />
      </div>
      <InputField label="Цена за час, ₽" type="number" value={hourlyRate} onChange={setHourlyRate} placeholder="3000" />
      <InputField label="Оборудование (через запятую)" value={equipment} onChange={setEquipment} placeholder="Коврики, Блоки, Ремни" />
      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
        <label style={{ fontSize: "11px", fontWeight: 700, color: "#999", letterSpacing: "0.6px", textTransform: "uppercase" }}>Цвет</label>
        <input type="color" value={color} onChange={e => setColor(e.target.value)} style={{ width: "40px", height: "32px", border: "1.5px solid rgba(26,26,26,0.09)", borderRadius: "8px", cursor: "pointer", background: "none" }} />
        <label style={{ display: "flex", alignItems: "center", gap: "7px", marginLeft: "auto", fontSize: "13px", color: "#555", cursor: "pointer" }}>
          <input type="checkbox" checked={isOnline} onChange={e => setIsOnline(e.target.checked)} />
          Онлайн-зал
        </label>
      </div>
    </ModalShell>
  );
}
