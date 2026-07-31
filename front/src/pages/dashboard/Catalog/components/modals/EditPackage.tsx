import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ModalShell, ModalHeader, ModalBody, ModalFooter, GhostButton, PrimaryButton, Input } from "../../../../../components/ui/modal";
import { Switch } from "../../../../../components/ui/index";
import { getCurrencySymbol } from "../../../../../components/UI";
import { useStudioCurrency } from "../../../../../hooks/useStudioCurrency";
import { useServiceList } from "../../hooks/useCatalogList";
import { useValidation } from "./useValidation";
import {
  PreviewPanel, StatPills, SectionLabel, Field, Hint,
  IconInfo, IconTicket, IconLayers, IconStore, IconTag, IconCalendar, IconCheck,
} from "./previewKit";
import { LEFT_PANEL_STYLE } from "./previewStyle";
import type { SubscriptionPackage } from "../../../../../api/catalog/catalog.types";

const PUNCH_LIMIT = 14; // больше точек в пропуск не влезает — остаток показываем числом

interface PackageModalProps {
  pkg: SubscriptionPackage | null; // null → создание
  onClose: () => void;
  onSubmit: (data: Omit<SubscriptionPackage, "id">) => Promise<void>;
}

export function PackageModal({ pkg, onClose, onSubmit }: PackageModalProps) {
  const { t } = useTranslation(["catalog", "common"]);
  const studioCurrency = useStudioCurrency();
  const currency = getCurrencySymbol(studioCurrency);
  const { services } = useServiceList();

  const [name, setName] = useState(pkg?.name ?? "");
  const [classCount, setClassCount] = useState(pkg != null ? String(pkg.class_count) : "");
  const [price, setPrice] = useState(pkg != null ? String(pkg.price) : "");
  const [durationDays, setDurationDays] = useState(pkg != null ? String(pkg.duration_days) : "30");
  const [serviceIds, setServiceIds] = useState<number[]>(pkg?.service_ids ?? []);
  const [isActive, setIsActive] = useState(pkg?.is_active ?? true);
  const [soldAsSubscription, setSoldAsSubscription] = useState(pkg?.sold_as_subscription ?? true);
  const [saving, setSaving] = useState(false);

  // Не вводится руками — считается на лету (одно поле лжи меньше).
  const perVisitPrice = Number(classCount) > 0 ? Math.round(Number(price) / Number(classCount)) : 0;

  const errors = {
    name: name.trim().length < 1 ? t("common:validation.required") : null,
    classCount: Number(classCount) >= 1 ? null : t("common:validation.min", { n: 1 }),
    price: Number(price) >= 0 ? null : t("common:validation.min", { n: 0 }),
    durationDays: Number(durationDays) >= 1 ? null : t("common:validation.min", { n: 1 }),
  };
  const { touch, show, hasErrors, trySubmit } = useValidation(errors);

  function toggleService(id: number) {
    setServiceIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  async function handleSave() {
    if (!trySubmit() || saving) return;
    setSaving(true);
    try {
      await onSubmit({
        name: name.trim(),
        class_count: Number(classCount),
        price: Number(price),
        per_visit_price: perVisitPrice,
        duration_days: Number(durationDays),
        service_ids: serviceIds.length ? serviceIds : null,
        is_active: isActive,
        sort_order: pkg?.sort_order ?? 0,
        sold_as_single: pkg?.sold_as_single ?? true,
        sold_as_subscription: soldAsSubscription,
      });
      onClose();
    } catch {
      // тост показывает родитель
    } finally {
      setSaving(false);
    }
  }

  const classes = Number(classCount) > 0 ? Number(classCount) : 0;
  const punches = Math.min(classes, PUNCH_LIMIT);

  const left = (
    <PreviewPanel eyebrow={t("catalog:modals.package.previewTitle")}>
      <div className={`cmod-pass${isActive ? "" : " is-off"}`}>
        <div className="cmod-pass-kind">
          {isActive ? t("catalog:modals.package.previewKind") : t("catalog:subscriptions.card.inactiveBadge")}
        </div>
        <div className={`cmod-pass-name${name.trim() ? "" : " is-empty"}`}>
          {name.trim() || t("catalog:modals.package.namePlaceholder")}
        </div>
        <div className="cmod-pass-price">
          {currency}{Number(price || 0).toLocaleString()}
        </div>
        <div className="cmod-punch">
          {Array.from({ length: punches }, (_, i) => (
            <b key={i} style={{ animationDelay: `${i * 28}ms` }} />
          ))}
          {classes > PUNCH_LIMIT && <span>+{classes - PUNCH_LIMIT}</span>}
        </div>
        <div className="cmod-pass-perf" />
        <div className="cmod-pass-foot">
          <div>
            <small>{t("catalog:modals.package.perVisitPrice")}</small>
            {perVisitPrice > 0 ? `${currency}${perVisitPrice.toLocaleString()}` : "—"}
          </div>
          <div style={{ textAlign: "right" }}>
            <small>{t("catalog:modals.package.previewValid")}</small>
            {Number(durationDays) > 0 ? t("catalog:subscriptions.card.duration", { count: Number(durationDays) }) : "—"}
          </div>
        </div>
      </div>
      <StatPills
        items={[
          { icon: <IconTicket size={13} />, value: classes || "—", label: t("catalog:modals.package.statClasses") },
          { icon: <IconTag size={13} />, value: perVisitPrice > 0 ? `${currency}${perVisitPrice.toLocaleString()}` : "—", label: t("catalog:modals.package.perVisitPrice") },
          { icon: <IconCalendar size={13} />, value: Number(durationDays) > 0 ? durationDays : "—", label: t("catalog:modals.package.statDays") },
          { icon: <IconLayers size={13} />, value: serviceIds.length || t("catalog:modals.package.statAll"), label: t("catalog:modals.package.services") },
        ]}
      />
    </PreviewPanel>
  );

  return (
    <ModalShell size="lg" onClose={onClose} left={left} leftWidth="320px" maxWidth="920px" leftStyle={LEFT_PANEL_STYLE}>
      <ModalHeader
        title={pkg ? t("catalog:modals.package.titleEdit") : t("catalog:modals.package.titleNew")}
        subtitle={t("catalog:modals.package.subtitle")}
      />
      <ModalBody>
        <SectionLabel icon={<IconInfo />} text={t("catalog:modals.package.sectionBasic")} />
        <Field delay={40}>
          <Input
            label={t("catalog:modals.package.name")}
            value={name}
            onChange={setName}
            onBlur={touch("name")}
            error={show("name")}
            placeholder={t("catalog:modals.package.namePlaceholder")}
          />
        </Field>

        <SectionLabel icon={<IconTicket />} text={t("catalog:modals.package.sectionTerms")} delay={70} />
        <Field delay={100} className="cmod-row">
          <Input
            label={t("catalog:modals.package.classCount")}
            type="number"
            value={classCount}
            onChange={setClassCount}
            onBlur={touch("classCount")}
            error={show("classCount")}
            placeholder={t("catalog:modals.package.classCountPlaceholder")}
          />
          <Input
            label={t("catalog:modals.package.priceShort")}
            type="number"
            value={price}
            onChange={setPrice}
            onBlur={touch("price")}
            error={show("price")}
            placeholder={t("catalog:modals.package.pricePlaceholder")}
            suffix={currency}
          />
        </Field>
        <Field delay={130}>
          <Input
            label={t("catalog:modals.package.durationDays")}
            type="number"
            value={durationDays}
            onChange={setDurationDays}
            onBlur={touch("durationDays")}
            error={show("durationDays")}
            placeholder={t("catalog:modals.package.durationDaysPlaceholder")}
          />
        </Field>

        <SectionLabel icon={<IconLayers />} text={t("catalog:modals.package.services")} delay={160} />
        <Field delay={190}>
          <div className="cmod-picks">
            {services.map(svc => {
              const on = serviceIds.includes(svc.id);
              return (
                <div
                  key={svc.id}
                  role="checkbox"
                  aria-checked={on}
                  tabIndex={0}
                  onClick={() => toggleService(svc.id)}
                  onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleService(svc.id); } }}
                  className={`cmod-pick${on ? " is-on" : ""}`}
                >
                  <span className="cmod-pick-dot" style={{ background: svc.color }} />
                  <span className="cmod-pick-name">{svc.name}</span>
                  <span className="cmod-check">{on && <IconCheck />}</span>
                </div>
              );
            })}
          </div>
        </Field>
        <Field delay={210}>
          <Hint text={serviceIds.length
            ? t("catalog:subscriptions.card.serviceCount", { count: serviceIds.length })
            : t("catalog:modals.package.servicesHint")}
          />
        </Field>

        <SectionLabel icon={<IconStore />} text={t("catalog:modals.package.sectionSale")} delay={240} />
        <Field delay={270}>
          <div className="cmod-toggle">
            <div>
              <div className="cmod-toggle-t">{t("catalog:modals.package.isActive")}</div>
              <div className="cmod-toggle-s">{t("catalog:modals.package.isActiveHint")}</div>
            </div>
            <Switch checked={isActive} onChange={setIsActive} />
          </div>
        </Field>
        <Field delay={290}>
          <div className="cmod-toggle">
            <div>
              <div className="cmod-toggle-t">{t("catalog:modals.package.soldAsSubscription")}</div>
              <div className="cmod-toggle-s">{t("catalog:modals.package.soldAsSubscriptionHint")}</div>
            </div>
            <Switch checked={soldAsSubscription} onChange={setSoldAsSubscription} />
          </div>
        </Field>
      </ModalBody>
      <ModalFooter>
        <GhostButton>{t("common:buttons.cancel")}</GhostButton>
        <PrimaryButton onClick={handleSave} disabled={hasErrors} loading={saving}>
          {pkg ? t("common:buttons.save") : t("common:buttons.create")}
        </PrimaryButton>
      </ModalFooter>
    </ModalShell>
  );
}
