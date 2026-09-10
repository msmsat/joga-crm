import { useState } from "react";
import { useTranslation } from "react-i18next";
import "../../../../../App.css";
import { ModalShell, ModalHeader, ModalBody, ModalFooter, GhostButton, PrimaryButton, Input, ColorPicker, COLOR_PRESETS, Segmented } from "../../../../../components/ui/modal";
import { Select } from "../../../../../components/ui/Select";
import { getCurrencySymbol } from "../../../../../components/UI";
import { useStudioCurrency } from "../../../../../hooks/useStudioCurrency";
import { useValidation } from "./useValidation";
import {
  PreviewPanel, StatPills, SectionLabel, Field, Hint,
  IconInfo, IconTag, IconClock, IconUsers, IconUser, IconPalette, IconLayers,
} from "./previewKit";
import { colorVars, LEFT_PANEL_STYLE } from "./previewStyle";
import { useBusinessTerms } from "../../../../../hooks/useBusinessTerms";
import type { Service } from "../../types";
import type { ServiceCreate } from "../../../../../api/studio/services.api";
import type { ServiceBookingMode } from "../../../../../api/booking/hybrid.types";
import { SERVICE_CATEGORIES } from "../../constants";

const PREVIEW_HOURS = ["09:00", "10:00", "11:00"];
const ROW_H = 58;   // высота часа в превью-журнале (совпадает с .cmod-jrn-row)

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
  // Слово для индивидуальной услуги берётся с сервера (HB-14): в подсказке
  // формы должно стоять слово отрасли студии, а не зашитая «услуга».
  const { offering } = useBusinessTerms("resource");

  // Компонент пересоздаётся по key при открытии (см. родителя),
  // поэтому начальные значения из service корректны без useEffect.
  const [name, setName] = useState(service?.name ?? "");
  // Категории вне списка (услуга из ассистента/импорта) в селекте нет — иначе
  // поле открывалось бы пустым и сохранение возвращало ту же чужую категорию.
  const [category, setCategory] = useState(
    SERVICE_CATEGORIES.includes(service?.category ?? "") ? service!.category : SERVICE_CATEGORIES[0]
  );
  const [type, setType] = useState<"group" | "individual">(service?.type ?? "group");
  const [price, setPrice] = useState(service != null ? String(service.price) : "");
  const [duration, setDuration] = useState(service != null ? String(service.duration_min) : "60");
  const [maxClients, setMaxClients] = useState(service?.max_clients != null ? String(service.max_clients) : "");
  const [color, setColor] = useState(service?.color ?? "#FCAE91");
  // HB-17: механика записи — своё поле. Групповая resource-услуга запрещена
  // сервером (§6.1), поэтому выбор resource переводит формат в индивидуальный,
  // а не оставляет сочетание, которое всё равно откажут при сохранении.
  const [bookingMode, setBookingMode] = useState<ServiceBookingMode>(service?.booking_mode ?? "event");
  const [bufferBefore, setBufferBefore] = useState(String(service?.buffer_before_min ?? 0));
  const [bufferAfter, setBufferAfter] = useState(String(service?.buffer_after_min ?? 0));
  const [isBookable, setIsBookable] = useState(service?.is_bookable ?? true);
  const [description, setDescription] = useState(service?.description ?? "");
  const [saving, setSaving] = useState(false);

  const errors = {
    name: name.trim().length < 1 ? t("common:validation.required") : null,
    price: Number(price) > 0 ? null : t("common:validation.positive"),
    duration: Number(duration) > 0 ? null : t("common:validation.positive"),
    maxClients: type === "group" && maxClients.trim() && Number(maxClients) < 1 ? t("common:validation.min", { n: 1 }) : null,
    // Диапазоны буферов и длительности resource повторяют CHECK базы
    // (0…240 и 1…1440): отказ должен приходить до сохранения, а не 422 после.
    bufferBefore: Number(bufferBefore) < 0 || Number(bufferBefore) > 240 ? t("common:validation.range", { min: 0, max: 240 }) : null,
    bufferAfter: Number(bufferAfter) < 0 || Number(bufferAfter) > 240 ? t("common:validation.range", { min: 0, max: 240 }) : null,
    resourceDuration: bookingMode === "resource" && (Number(duration) < 1 || Number(duration) > 1440)
      ? t("common:validation.range", { min: 1, max: 1440 }) : null,
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
        service_type: bookingMode === "resource" ? "individual" : type,
        color: color || null,
        // У resource вместимость всегда 1 и не редактируется (§4.4).
        max_clients: bookingMode === "resource"
          ? 1
          : type === "group" && maxClients.trim() ? Number(maxClients) : null,
        description: description.trim() || null,
        booking_mode: bookingMode,
        buffer_before_min: Number(bufferBefore) || 0,
        buffer_after_min: Number(bufferAfter) || 0,
        is_bookable: isBookable,
      });
      onClose();
    } catch {
      // тост показывает родитель
    } finally {
      setSaving(false);
    }
  }

  // Превью: высота карточки пропорциональна длительности (час = ROW_H),
  // ограничена сеткой из трёх часов.
  const durMin = Number(duration) > 0 ? Number(duration) : 0;
  const cardH = Math.min(Math.max(Math.round((durMin / 60) * ROW_H), 38), ROW_H * PREVIEW_HOURS.length);

  const left = (
    <PreviewPanel eyebrow={t("catalog:modals.service.previewTitle")}>
      <div className="cmod-jrn" style={colorVars(color)}>
        {PREVIEW_HOURS.map(h => (
          <div key={h} className="cmod-jrn-row">
            <span className="cmod-jrn-time">{h}</span>
            <i />
          </div>
        ))}
        <div className="cmod-jcard" style={{ ["--cmod-h" as string]: `${cardH}px` }}>
          <div className={`cmod-jcard-name${name.trim() ? "" : " is-empty"}`}>
            {name.trim() || t("catalog:modals.service.namePlaceholder")}
          </div>
          <div className="cmod-jcard-meta">
            <IconClock size={11} />
            {durMin || "—"} {t("common:units.min")}
            {type === "group" && maxClients.trim() && (
              <span className="cmod-jcard-seats">0/{maxClients}</span>
            )}
          </div>
        </div>
      </div>
      <StatPills
        items={[
          { icon: <IconTag size={13} />, value: price ? `${currency}${Number(price).toLocaleString()}` : "—", label: t("catalog:services.stats.price") },
          { icon: <IconClock size={13} />, value: durMin ? `${durMin} ${t("common:units.min")}` : "—", label: t("catalog:services.stats.duration") },
          type === "group"
            ? { icon: <IconUsers size={13} />, value: maxClients.trim() || "—", label: t("catalog:modals.service.statSeats") }
            : { icon: <IconUser size={13} />, value: t("catalog:services.details.personal"), label: t("catalog:modals.service.type") },
          { icon: <IconLayers size={13} />, value: tCat(category), label: t("catalog:modals.service.category") },
        ]}
      />
    </PreviewPanel>
  );

  return (
    <ModalShell size="lg" onClose={onClose} left={left} leftWidth="320px" maxWidth="920px" leftStyle={LEFT_PANEL_STYLE}>
      <ModalHeader
        title={service ? t("catalog:modals.service.titleEdit") : t("catalog:modals.service.titleNew")}
        subtitle={t("catalog:modals.service.subtitle")}
      />
      <ModalBody>
        <SectionLabel icon={<IconInfo />} text={t("catalog:modals.service.sectionBasic")} />
        <Field delay={40}>
          <Input label={t("catalog:modals.service.name")} value={name} onChange={setName} onBlur={touch("name")} error={show("name")} placeholder={t("catalog:modals.service.namePlaceholder")} />
        </Field>
        <Field delay={70} className="cmod-row">
          <div>
            <label className="vk-label">{t("catalog:modals.service.category")}</label>
            <Select
              value={category}
              options={SERVICE_CATEGORIES.map(c => ({ value: c, label: tCat(c) }))}
              onChange={setCategory}
            />
          </div>
          <Segmented
            label={t("catalog:modals.service.type")}
            value={bookingMode === "resource" ? "individual" : type}
            onChange={setType}
            disabled={bookingMode === "resource"}
            options={[
              { value: "group", label: t("catalog:modals.service.typeGroup"), icon: <IconUsers size={13} /> },
              { value: "individual", label: t("catalog:modals.service.typeIndividual"), icon: <IconUser size={13} /> },
            ]}
          />
        </Field>
        <Field delay={85} className="cmod-row">
          <Segmented
            label={t("catalog:modals.service.bookingMode")}
            value={bookingMode}
            onChange={(value: ServiceBookingMode) => {
              setBookingMode(value);
              if (value === "resource") setType("individual");
            }}
            options={[
              { value: "event", label: t("catalog:modals.service.bookingModeEvent"), icon: <IconUsers size={13} /> },
              { value: "resource", label: t("catalog:modals.service.bookingModeResource"), icon: <IconUser size={13} /> },
            ]}
          />
          <Segmented
            label={t("catalog:modals.service.bookable")}
            value={isBookable ? "on" : "off"}
            onChange={(value: string) => setIsBookable(value === "on")}
            options={[
              { value: "on", label: t("catalog:modals.service.bookableOn") },
              { value: "off", label: t("catalog:modals.service.bookableOff") },
            ]}
          />
        </Field>
        <Field delay={95}>
          <Hint text={bookingMode === "resource"
            ? t("catalog:modals.service.bookingModeResourceHint", { offering: offering?.singular ?? "" })
            : t("catalog:modals.service.bookingModeEventHint")} />
        </Field>

        <SectionLabel icon={<IconTag />} text={t("catalog:modals.service.sectionPricing")} delay={100} />
        <Field delay={130} className="cmod-row">
          <Input label={t("catalog:modals.service.priceShort")} type="number" value={price} onChange={setPrice} onBlur={touch("price")} error={show("price")} placeholder={t("catalog:modals.service.pricePlaceholder")} suffix={currency} />
          <Input label={t("catalog:modals.service.durationShort")} type="number" value={duration} onChange={setDuration} onBlur={touch("duration")} error={show("duration")} placeholder={t("catalog:modals.service.durationPlaceholder")} suffix={t("common:units.min")} />
        </Field>
        {/* Вместимость только у события: у индивидуальной записи её нет —
            занят не коврик, а время специалиста, и сервер всегда пишет 1. */}
        {bookingMode === "event" && type === "group" && (
          <Field delay={160}>
            <Input label={t("catalog:modals.service.maxClients")} type="number" value={maxClients} onChange={setMaxClients} onBlur={touch("maxClients")} error={show("maxClients")} placeholder={t("catalog:modals.service.maxClientsPlaceholder")} />
          </Field>
        )}
        {bookingMode === "resource" && (
          <Field delay={160} className="cmod-row">
            <Input label={t("catalog:modals.service.bufferBefore")} type="number" value={bufferBefore}
                   onChange={setBufferBefore} onBlur={touch("bufferBefore")} error={show("bufferBefore")}
                   suffix={t("common:units.min")} />
            <Input label={t("catalog:modals.service.bufferAfter")} type="number" value={bufferAfter}
                   onChange={setBufferAfter} onBlur={touch("bufferAfter")} error={show("bufferAfter")}
                   suffix={t("common:units.min")} />
          </Field>
        )}

        <SectionLabel icon={<IconPalette />} text={t("catalog:modals.service.sectionLook")} delay={190} />
        <Field delay={220}>
          <ColorPicker label={t("catalog:modals.service.color")} value={color} onChange={setColor} presets={COLOR_PRESETS} />
        </Field>
        <Field delay={240}>
          <Hint text={t("catalog:modals.service.colorHint")} />
        </Field>
        <Field delay={260}>
          <Input label={t("catalog:modals.service.description")} value={description} onChange={setDescription} placeholder={t("catalog:modals.service.descriptionPlaceholder")} rows={3} />
        </Field>
      </ModalBody>
      <ModalFooter>
        <GhostButton>{t("common:buttons.cancel")}</GhostButton>
        <PrimaryButton onClick={handleSave} disabled={hasErrors} loading={saving}>{service ? t("common:buttons.save") : t("common:buttons.create")}</PrimaryButton>
      </ModalFooter>
    </ModalShell>
  );
}
