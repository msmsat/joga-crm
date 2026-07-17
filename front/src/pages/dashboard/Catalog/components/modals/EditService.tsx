import { useState } from "react";
import { useTranslation } from "react-i18next";
import "../../../../../App.css";
import { ModalShell, ModalHeader, ModalBody, ModalFooter, GhostButton, PrimaryButton, Input, ColorPicker } from "../../../../../components/ui/modal";
import { Select } from "../../../../../components/ui/Select";
import { getCurrencySymbol } from "../../../../../components/UI";
import { useStudioCurrency } from "../../hooks/useStudioCurrency";
import { useValidation } from "./useValidation";
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
  const { t } = useTranslation(["catalog", "common"]);
  // Перевод значения категории по ключу с fallback (значения-ключи мигрируют в задаче 14).
  const tCat = (cat: string) => t(`catalog:services.categories.${cat}`, { defaultValue: cat });
  const studioCurrency = useStudioCurrency();
  const currency = getCurrencySymbol(studioCurrency);

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

  const errors = {
    name: name.trim().length < 1 ? t("common:validation.required") : null,
    price: Number(price) > 0 ? null : t("common:validation.positive"),
    duration: Number(duration) > 0 ? null : t("common:validation.positive"),
    maxClients: type === "group" && maxClients.trim() && Number(maxClients) < 1 ? t("common:validation.min", { n: 1 }) : null,
  };
  const { touch, show, hasErrors, trySubmit } = useValidation(errors);

  async function handleSave() {
    if (!trySubmit() || saving) return;
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

  return (
    <ModalShell size="sm" onClose={onClose}>
      <ModalHeader title={service ? t("catalog:modals.service.titleEdit") : t("catalog:modals.service.titleNew")} />
      <ModalBody>
        <Input label={t("catalog:modals.service.name")} value={name} onChange={setName} onBlur={touch("name")} error={show("name")} placeholder={t("catalog:modals.service.namePlaceholder")} />

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
          <div>
            <label style={fieldLabel}>{t("catalog:modals.service.category")}</label>
            <Select
              value={category}
              options={SERVICE_CATEGORIES.map(c => ({ value: c, label: tCat(c) }))}
              onChange={setCategory}
            />
          </div>
          <div>
            <label style={fieldLabel}>{t("catalog:modals.service.type")}</label>
            <Select
              value={type}
              options={[
                { value: "group", label: t("catalog:modals.service.typeGroup") },
                { value: "individual", label: t("catalog:modals.service.typeIndividual") },
              ]}
              onChange={v => setType(v as "group" | "individual")}
            />
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
          <Input label={t("catalog:modals.service.price", { currency })} type="number" value={price} onChange={setPrice} onBlur={touch("price")} error={show("price")} placeholder={t("catalog:modals.service.pricePlaceholder")} />
          <Input label={t("catalog:modals.service.duration")} type="number" value={duration} onChange={setDuration} onBlur={touch("duration")} error={show("duration")} placeholder={t("catalog:modals.service.durationPlaceholder")} />
        </div>

        {type === "group" && (
          <Input label={t("catalog:modals.service.maxClients")} type="number" value={maxClients} onChange={setMaxClients} onBlur={touch("maxClients")} error={show("maxClients")} placeholder={t("catalog:modals.service.maxClientsPlaceholder")} />
        )}

        <Input label={t("catalog:modals.service.description")} value={description} onChange={setDescription} placeholder={t("catalog:modals.service.descriptionPlaceholder")} />

        <ColorPicker label={t("catalog:modals.service.color")} value={color} onChange={setColor} />
      </ModalBody>
      <ModalFooter>
        <GhostButton>{t("common:buttons.cancel")}</GhostButton>
        <PrimaryButton onClick={handleSave} disabled={hasErrors} loading={saving}>{service ? t("common:buttons.save") : t("common:buttons.create")}</PrimaryButton>
      </ModalFooter>
    </ModalShell>
  );
}

const fieldLabel: React.CSSProperties = {
  display: "block", fontSize: "11px", fontWeight: 700,
  color: "#999", letterSpacing: "0.6px",
  textTransform: "uppercase", marginBottom: "7px",
};
