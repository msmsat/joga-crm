import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ModalShell, ModalHeader, ModalBody, ModalFooter, GhostButton, PrimaryButton, Input } from "../../../../../components/ui/modal";
import { getCurrencySymbol } from "../../../../../components/UI";
import { useStudioCurrency } from "../../hooks/useStudioCurrency";
import { useServiceList } from "../../hooks/useCatalogList";
import { useValidation } from "./useValidation";
import type { SubscriptionPackage } from "../../../../../api/catalog/catalog.types";

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
      <ModalHeader title={pkg ? t("catalog:modals.package.titleEdit") : t("catalog:modals.package.titleNew")} />
      <ModalBody>
        <Input
          label={t("catalog:modals.package.name")}
          value={name}
          onChange={setName}
          onBlur={touch("name")}
          error={show("name")}
          placeholder={t("catalog:modals.package.namePlaceholder")}
        />

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
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
            label={t("catalog:modals.package.price", { currency })}
            type="number"
            value={price}
            onChange={setPrice}
            onBlur={touch("price")}
            error={show("price")}
            placeholder={t("catalog:modals.package.pricePlaceholder")}
          />
        </div>

        {Number(classCount) > 0 && Number(price) > 0 && (
          <div style={{ fontSize: "12px", color: "#888" }}>
            {t("catalog:modals.package.perVisitPrice")}: {currency}{perVisitPrice.toLocaleString()}
          </div>
        )}

        <Input
          label={t("catalog:modals.package.durationDays")}
          type="number"
          value={durationDays}
          onChange={setDurationDays}
          onBlur={touch("durationDays")}
          error={show("durationDays")}
          placeholder={t("catalog:modals.package.durationDaysPlaceholder")}
        />

        <div>
          <label style={{ display: "block", fontSize: "11px", fontWeight: 700, color: "#999", letterSpacing: "0.6px", textTransform: "uppercase", marginBottom: "7px" }}>
            {t("catalog:modals.package.services")}
          </label>
          <div style={{
            display: "flex", flexDirection: "column", gap: "2px",
            maxHeight: "160px", overflowY: "auto",
            border: "1.5px solid rgba(26,26,26,0.09)", borderRadius: "12px", padding: "6px",
          }}>
            {services.map(svc => (
              <label
                key={svc.id}
                style={{ display: "flex", alignItems: "center", gap: "8px", padding: "6px 8px", borderRadius: "8px", cursor: "pointer", fontSize: "13px" }}
              >
                <input type="checkbox" checked={serviceIds.includes(svc.id)} onChange={() => toggleService(svc.id)} />
                {svc.name}
              </label>
            ))}
          </div>
          <div style={{ fontSize: "11.5px", color: "#AAA", marginTop: "6px" }}>
            {t("catalog:modals.package.servicesHint")}
          </div>
        </div>

        <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", color: "#555", cursor: "pointer" }}>
          <input type="checkbox" checked={isActive} onChange={e => setIsActive(e.target.checked)} />
          {t("catalog:modals.package.isActive")}
        </label>
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
