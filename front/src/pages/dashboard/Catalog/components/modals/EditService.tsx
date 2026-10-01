import { useRef, useState } from "react";
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
import { categoryOptions, NO_CATEGORY } from "../../serviceCategories";

import { BundleEditor } from "./BundleEditor";

const PREVIEW_HOURS = ["09:00", "10:00", "11:00"];
const ROW_H = 58;   // высота часа в превью-журнале (совпадает с .cmod-jrn-row)

interface ServiceModalProps {
  bundle?: boolean;
  services: Service[];
  service: Service | null; // null → создание
  /** Категории, которые студия уже использует: набор свой у каждой студии и
   *  живёт в самих услугах, справочника категорий нет. */
  categories: string[];
  onClose: () => void;
  // Форма всегда даёт полный набор с обязательным name/price → ServiceCreate.
  onSubmit: (data: ServiceCreate) => Promise<void>;
}

export function ServiceModal({ service, categories, services, bundle = false, onClose, onSubmit }: ServiceModalProps) {
  const { t } = useTranslation(["catalog", "common"]);
  // Старые значения-ключи ('yoga') переводятся по ключу, свои категории студии
  // («Стрижка») показываются как есть — их печатал сам человек.
  const tCat = (cat: string) => t(`catalog:services.categories.${cat}`, { defaultValue: cat });
  const studioCurrency = useStudioCurrency();
  const currency = getCurrencySymbol(studioCurrency);
  // Слово для индивидуальной услуги берётся с сервера (HB-14): в подсказке
  // формы должно стоять слово отрасли студии, а не зашитая «услуга».
  const { offering, capabilities } = useBusinessTerms("resource");
  // Механику записи решает студия: онбординг выставил её по направлению
  // (барбершоп — выбор времени, йога — запись на занятие). Спрашиваем только
  // смешанную студию — там у каждой услуги своя.
  const studioMode = capabilities?.booking_mode;
  const askMode = studioMode === "hybrid";

  // Компонент пересоздаётся по key при открытии (см. родителя),
  // поэтому начальные значения из service корректны без useEffect.
  const isBundle = bundle || Boolean(service?.bundle_items.length);
  const [partIds, setPartIds] = useState(service?.bundle_items.map(p => p.service_id) ?? []);
  const [priceEdited, setPriceEdited] = useState(Boolean(service));
  const [durationEdited, setDurationEdited] = useState(Boolean(service));
  const savingRef = useRef(false);
  const [name, setName] = useState(service?.name ?? "");
  // Категорию не выбирают из отраслей: чем занимается студия, она сказала при
  // регистрации. Здесь — её собственные направления, и новое заводится тут же,
  // строкой «Создать категорию» в списке.
  const [category, setCategory] = useState(service?.category || NO_CATEGORY);
  const [price, setPrice] = useState(service != null ? String(service.price) : "");
  const [duration, setDuration] = useState(service != null ? String(service.duration_min) : "60");
  // Индивидуальное занятие из расписания — это одно место, а не отдельный
  // переключатель «Тип». Старая индивидуальная услуга без числа мест
  // открывается с единицей, иначе при сохранении стала бы групповой.
  const [maxClients, setMaxClients] = useState(
    service?.max_clients != null ? String(service.max_clients) : service?.type === "individual" ? "1" : "");
  const [color, setColor] = useState(service?.color ?? "#FCAE91");
  const [pickedMode, setPickedMode] = useState<ServiceBookingMode>(service?.booking_mode ?? "event");
  // У существующей услуги механика своя; новая берёт студийную. Пока
  // настройки не пришли, форма рисует занятие — сервер всё равно выведет
  // механику сам, раз форма её не прислала.
  const bookingMode: ServiceBookingMode = askMode || service ? pickedMode
    : studioMode === "resource" ? "resource" : "event";
  // Формат выводится из механики и мест — групповой resource не бывает (§6.1).
  const type: "group" | "individual" =
    isBundle || bookingMode === "resource" || maxClients.trim() === "1" ? "individual" : "group";
  const [bufferBefore, setBufferBefore] = useState(String(service?.buffer_before_min ?? 0));
  const [bufferAfter, setBufferAfter] = useState(String(service?.buffer_after_min ?? 0));
  const [description, setDescription] = useState(service?.description ?? "");
  const [saving, setSaving] = useState(false);

  const parts = partIds.map(id => services.find(s => s.id === id)).filter((s): s is Service => Boolean(s));
  const fullPrice = parts.reduce((sum, part) => sum + part.price, 0);
  const fullDuration = parts.reduce((sum, part) => sum + part.duration_min, 0);
  function changeParts(ids: number[]) {
    setPartIds(ids);
    const next = ids.map(id => services.find(s => s.id === id));
    if (!priceEdited) setPrice(String(next.reduce((sum, part) => sum + (part?.price ?? 0), 0)));
    if (!durationEdited) setDuration(String(next.reduce((sum, part) => sum + (part?.duration_min ?? 0), 0)));
  }
  const errors = {
    parts: isBundle && (parts.length < 2 || parts.length > 10 || parts.length !== partIds.length) ? t("catalog:bundles.size") : null,
    name: name.trim().length < 1 ? t("common:validation.required") : null,
    price: price.trim() && Number.isInteger(Number(price)) && Number(price) >= 0 ? null : t("common:validation.min", { n: 0 }),
    duration: Number.isInteger(Number(duration)) && Number(duration) > 0 ? null : t("common:validation.positive"),
    maxClients: bookingMode === "event" && maxClients.trim() && Number(maxClients) < 1 ? t("common:validation.min", { n: 1 }) : null,
    // Диапазоны буферов и длительности resource повторяют CHECK базы
    // (0…240 и 1…1440): отказ должен приходить до сохранения, а не 422 после.
    bufferBefore: !Number.isInteger(Number(bufferBefore)) || Number(bufferBefore) < 0 || Number(bufferBefore) > 240 ? t("common:validation.range", { min: 0, max: 240 }) : null,
    bufferAfter: !Number.isInteger(Number(bufferAfter)) || Number(bufferAfter) < 0 || Number(bufferAfter) > 240 ? t("common:validation.range", { min: 0, max: 240 }) : null,
    resourceDuration: bookingMode === "resource" && (Number(duration) < 1 || Number(duration) > 1440)
      ? t("common:validation.range", { min: 1, max: 1440 }) : null,
  };
  const { touch, show, hasErrors, trySubmit } = useValidation(errors);

  async function handleSave() {
    if (!trySubmit() || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      await onSubmit({
        ...(isBundle ? { bundle_service_ids: partIds } : {}),
        name: name.trim(),
        price: Number(price),
        duration_min: Number(duration) || 60,
        // «Без категории» — это NULL в базе, а не строка 'other'.
        category: !isBundle && category && category !== NO_CATEGORY ? category : null,
        service_type: type,
        color: color || null,
        // У resource вместимость всегда 1 и не редактируется (§4.4).
        max_clients: bookingMode === "resource"
          ? 1
          : maxClients.trim() ? Number(maxClients) : null,
        description: description.trim() || null,
        // Механику шлём, только когда её выбирали: иначе её решает студия, а
        // у существующей услуги она остаётся прежней.
        ...(askMode ? { booking_mode: bookingMode } : {}),
        buffer_before_min: Number(bufferBefore) || 0,
        buffer_after_min: Number(bufferAfter) || 0,
      });
      onClose();
    } catch {
      // тост показывает родитель
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  // Превью: высота карточки пропорциональна длительности (час = ROW_H),
  // ограничена сеткой из трёх часов.
  const durMin = Number(duration) > 0 ? Number(duration) : 0;
  const cardH = Math.min(Math.max(Math.round((durMin / 60) * ROW_H), 38), ROW_H * PREVIEW_HOURS.length);

  const preview = (
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
          {isBundle && <div className="cat-bundle-muted">{parts.map(p => p.name).join(' · ')}</div>}
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
          { icon: <IconLayers size={13} />, value: isBundle ? t("catalog:bundles.badge") : tCat(category), label: t("catalog:modals.service.category") },
        ]}
      />
    </PreviewPanel>
  );

  return (
    <ModalShell dismissible={!saving} size="lg" onClose={onClose} left={isBundle ? <>
      <BundleEditor services={services} parts={parts} partIds={partIds} onChange={changeParts} error={show("parts")} />
      {preview}
    </> : preview} leftWidth={isBundle ? "380px" : "320px"} maxWidth="920px" leftStyle={LEFT_PANEL_STYLE}>
      <ModalHeader
        title={isBundle ? t(service ? "catalog:bundles.edit" : "catalog:bundles.create") : service ? t("catalog:modals.service.titleEdit") : t("catalog:modals.service.titleNew")}
        subtitle={t("catalog:modals.service.subtitle")}
      />
      <ModalBody>
        <SectionLabel icon={<IconInfo />} text={t("catalog:modals.service.sectionBasic")} />
        <Field delay={40}>
          <Input label={t("catalog:modals.service.name")} value={name} onChange={setName} onBlur={touch("name")} error={show("name")} placeholder={t("catalog:modals.service.namePlaceholder")} />
        </Field>
        {!isBundle && <Field delay={70}>
          <label className="vk-label">{t("catalog:modals.service.category")}</label>
          <Select
            value={category}
            options={categoryOptions(categories, category, tCat).map(c => ({ value: c, label: tCat(c) }))}
            onChange={setCategory}
            creatable
            createLabel={t("catalog:modals.service.categoryCreate")}
            createPlaceholder={t("catalog:modals.service.categoryNewPlaceholder")}
          />
        </Field>
        }
        {isBundle && <div className="cat-bundle-mobile"><BundleEditor services={services} parts={parts} partIds={partIds} onChange={changeParts} error={show("parts")} /></div>}
        {askMode && (
          <Field delay={85}>
            <Segmented
              label={t("catalog:modals.service.bookingMode")}
              value={bookingMode}
              onChange={setPickedMode}
              options={[
                { value: "event", label: t("catalog:modals.service.bookingModeEvent"), icon: <IconUsers size={13} /> },
                { value: "resource", label: t("catalog:modals.service.bookingModeResource"), icon: <IconUser size={13} /> },
              ]}
            />
          </Field>
        )}
        <Field delay={95}>
          <Hint text={bookingMode === "resource"
            ? t("catalog:modals.service.bookingModeResourceHint", { offering: offering?.singular ?? "" })
            : t("catalog:modals.service.bookingModeEventHint")} />
        </Field>

        <SectionLabel icon={<IconTag />} text={t("catalog:modals.service.sectionPricing")} delay={100} />
        <Field delay={130} className="cmod-row">
          <Input label={t("catalog:modals.service.priceShort")} type="number" value={price} onChange={value => { setPriceEdited(true); setPrice(value); }} onBlur={touch("price")} error={show("price")} placeholder={t("catalog:modals.service.pricePlaceholder")} suffix={currency} />
          <Input label={t("catalog:modals.service.durationShort")} type="number" value={duration} onChange={value => { setDurationEdited(true); setDuration(value); }} onBlur={touch("duration")} error={show("duration") || show("resourceDuration")} placeholder={t("catalog:modals.service.durationPlaceholder")} suffix={t("common:units.min")} />
        </Field>
        {isBundle && <p className="cat-bundle-muted">{t("catalog:bundles.separate")}: {currency}{fullPrice.toLocaleString()} · {fullDuration} {t("common:units.min")}</p>}
        {/* Вместимость только у события: у записи на время её нет — занят не
            коврик, а время специалиста, и сервер всегда пишет 1. Одно место —
            это и есть индивидуальное занятие. */}
        {bookingMode === "event" && !isBundle && (
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
