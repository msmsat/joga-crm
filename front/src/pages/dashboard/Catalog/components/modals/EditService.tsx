import { useState } from "react";
import { createPortal } from "react-dom";
import "../../../../../App.css";
import { InputField } from "../../../../../components/UI";
import type { Service } from "../../types";
import type { ServiceCreate } from "../../../../../api/studio/services.api";
import { SERVICE_CATEGORIES } from "../../constants";

interface ServiceModalProps {
  service: Service | null; // null → создание
  onClose: () => void;
  // Форма всегда даёт полный набор с обязательным name/price → ServiceCreate.
  onSubmit: (data: ServiceCreate) => Promise<void>;
}

export function ServiceModal({ service, onClose, onSubmit }: ServiceModalProps) {
  // Компонент пересоздаётся по key при открытии (см. родителя),
  // поэтому начальные значения из service корректны без useEffect.
  const [name, setName] = useState(service?.name ?? "");
  const [category, setCategory] = useState(service?.category ?? SERVICE_CATEGORIES[0]);
  const [type, setType] = useState<"group" | "individual">(service?.type ?? "group");
  const [price, setPrice] = useState(service != null ? String(service.price) : "");
  const [duration, setDuration] = useState(service != null ? String(service.duration_min) : "60");
  const [maxClients, setMaxClients] = useState(service?.max_clients != null ? String(service.max_clients) : "");
  const [color, setColor] = useState(service?.color ?? "#FCAE91");
  const [description, setDescription] = useState(service?.description ?? "");
  const [saving, setSaving] = useState(false);

  const canSave = name.trim().length >= 1 && Number(price) > 0 && !saving;

  async function handleSave() {
    if (!canSave) return;
    setSaving(true);
    try {
      await onSubmit({
        name: name.trim(),
        price: Number(price),
        duration_min: Number(duration) || 60,
        category: category || null,
        service_type: type,
        color: color || null,
        max_clients: type === "group" && maxClients.trim() ? Number(maxClients) : null,
        description: description.trim() || null,
      });
      onClose();
    } catch {
      // тост показывает родитель
    } finally {
      setSaving(false);
    }
  }

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
          width: "100%", maxWidth: "480px", maxHeight: "calc(100vh - 32px)",
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
            {service ? "Редактировать услугу" : "Новая услуга"}
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
          <InputField label="Название услуги" value={name} onChange={setName} placeholder="Хатха-йога" />

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <div>
              <label style={fieldLabel}>Категория</label>
              <select value={category} onChange={e => setCategory(e.target.value)} style={selectStyle}>
                {SERVICE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label style={fieldLabel}>Тип</label>
              <select value={type} onChange={e => setType(e.target.value as "group" | "individual")} style={selectStyle}>
                <option value="group">Групповая</option>
                <option value="individual">Индивидуальная</option>
              </select>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <InputField label="Цена, ₽" type="number" value={price} onChange={setPrice} placeholder="1200" />
            <InputField label="Длительность, мин" type="number" value={duration} onChange={setDuration} placeholder="60" />
          </div>

          {type === "group" && (
            <InputField label="Макс. клиентов" type="number" value={maxClients} onChange={setMaxClients} placeholder="15" />
          )}

          <InputField label="Описание" value={description} onChange={setDescription} placeholder="Короткое описание услуги" />

          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <label style={fieldLabel}>Цвет</label>
            <input type="color" value={color} onChange={e => setColor(e.target.value)} style={{ width: "40px", height: "32px", border: "1.5px solid rgba(26,26,26,0.09)", borderRadius: "8px", cursor: "pointer", background: "none" }} />
          </div>
        </div>

        <div style={{ display: "flex", gap: "10px", padding: "16px 24px", borderTop: "1px solid #F0EDE8" }}>
          <button
            onClick={onClose}
            style={{
              padding: "12px 18px", background: "transparent",
              border: "1.5px solid #EEEBE6", borderRadius: "12px",
              fontSize: "13px", fontWeight: 600, color: "#888",
              cursor: "pointer", fontFamily: "Manrope, sans-serif",
            }}
          >
            Отмена
          </button>
          <button
            onClick={handleSave}
            disabled={!canSave}
            style={{
              flex: 1, padding: "12px 20px",
              background: "linear-gradient(135deg, #FCAE91, #F9A08B)",
              border: "none", borderRadius: "12px",
              fontSize: "14px", fontWeight: 700, color: "white",
              cursor: canSave ? "pointer" : "not-allowed",
              fontFamily: "Manrope, sans-serif", opacity: canSave ? 1 : 0.5,
              boxShadow: "0 8px 24px rgba(252,174,145,0.3)",
            }}
          >
            {service ? "Сохранить" : "Создать"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

const fieldLabel: React.CSSProperties = {
  display: "block", fontSize: "11px", fontWeight: 700,
  color: "#999", letterSpacing: "0.6px",
  textTransform: "uppercase", marginBottom: "7px",
};

const selectStyle: React.CSSProperties = {
  width: "100%", padding: "12px 15px",
  background: "rgba(26,26,26,0.025)",
  border: "1.5px solid rgba(26,26,26,0.09)",
  borderRadius: "12px", fontSize: "14px", fontWeight: 500, color: "#1A1A1A",
  outline: "none", fontFamily: "Manrope, sans-serif", boxSizing: "border-box",
  cursor: "pointer",
};
