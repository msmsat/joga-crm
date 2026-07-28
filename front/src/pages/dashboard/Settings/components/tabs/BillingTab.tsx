import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { icons } from "../ui/SettingsIcons";
import SectionHeader from "../ui/SectionHeader";
import StatusBadge from "../ui/StatusBadge";
import { Button, EmptyState, Switch, useToast } from "../../../../../components/ui/index";
import { billingApi } from "../../../../../api/billing/billing.api";
import { useStudioCurrency } from "../../../../../hooks/useStudioCurrency";
import { formatMoney } from "../../../../../lib/money";
import type { useBilling } from "../../hooks/useBilling";

type BillingTabProps = ReturnType<typeof useBilling>;

// Сентинел бэка (webhook.py) для тарифа без лимита сотрудников (business).
const UNLIMITED_STAFF = 9999;

const INVOICE_BADGE: Record<string, "active" | "warning" | "info"> = {
  paid: "active",
  pending: "info",
  failed: "warning",
  refunded: "warning",
};

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;
}

export default function BillingTab({ plan, invoices, cards, setAutopay, renew }: BillingTabProps) {
  const { t } = useTranslation('settings');
  const navigate = useNavigate();
  const toast = useToast();
  const currency = useStudioCurrency();
  const [isExporting, setIsExporting] = useState(false);

  // Основная (или первая сохранённая) карта — read-only витрина, управление на /dashboard/billing.
  const card = cards.data?.find(c => c.is_primary) ?? cards.data?.[0] ?? null;
  const invoiceItems = invoices.data?.items ?? [];
  const invoiceTotal = invoices.data?.total ?? 0;

  if (plan.isError) {
    return (
      <EmptyState
        title={t('common:errors.loadFailed')}
        action={<Button variant="primary" onClick={() => plan.refetch()}>{t('common:errors.retry')}</Button>}
      />
    );
  }

  if (plan.isLoading || !plan.data) {
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: "60px 0", color: "var(--muted)", fontSize: "13px" }}>
        {t('common:loading')}
      </div>
    );
  }

  const p = plan.data;

  // Студия без подписки (до первой оплаты) — CTA вместо пустых полей, не голая карточка.
  if (p.plan_name === "none") {
    return (
      <EmptyState
        title={t('billing.plan.noSubscription')}
        action={<Button variant="primary" onClick={() => navigate('/dashboard/billing')}>{t('billing.plan.noSubscriptionCta')}</Button>}
      />
    );
  }

  const onExport = async () => {
    setIsExporting(true);
    try {
      await billingApi.exportInvoicesCsv();
    } catch {
      toast.error(t('billing.toast.csvExportError'));
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      {/* Текущий тариф + условные действия («Улучшить тариф» / «Продлить») */}
      <div style={{
        borderRadius: "16px", padding: "32px 40px",
        background: "linear-gradient(135deg, #16161a 0%, #222226 100%)",
        border: "1px solid rgba(255,255,255,0.05)",
        position: "relative", overflow: "hidden",
        boxShadow: "0 20px 40px rgba(0,0,0,0.12)"
      }}>
        <div style={{ position: "absolute", top: "-40px", right: "-40px", width: "200px", height: "200px", background: "radial-gradient(circle, rgba(252,174,145,0.15) 0%, transparent 70%)", pointerEvents: "none" }} />
        <div style={{ position: "relative", zIndex: 1 }}>
          <div style={{ fontSize: "10.5px", fontWeight: 800, color: "rgba(252,174,145,0.85)", letterSpacing: "1.5px", textTransform: "uppercase", marginBottom: "6px" }}>
            {t('billing.plan.title')}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "14px", marginBottom: "16px" }}>
            <div style={{ fontSize: "32px", fontWeight: 900, color: "white", letterSpacing: "-1px" }}>{t(`billing.plans.${p.plan_name}`)}</div>
            <StatusBadge type={p.status === "active" ? "active" : p.status === "trial" ? "info" : "warning"}>{t(`billing.status.${p.status}`)}</StatusBadge>
          </div>
          <div style={{ display: "flex", gap: "32px", marginBottom: "28px", flexWrap: "wrap" }}>
            {p.expires_at && (
              <div style={{ fontSize: "12.5px", color: "rgba(255,255,255,0.55)" }}>
                {t('billing.plan.expiresAt', { date: fmtDate(p.expires_at) })}
              </div>
            )}
            <div style={{ fontSize: "12.5px", color: "rgba(255,255,255,0.55)" }}>
              {p.max_staff >= UNLIMITED_STAFF ? t('billing.plan.staffUnlimited') : t('billing.plan.maxStaff', { count: p.max_staff })}
            </div>
          </div>
          {p.can_upgrade && (
            <Button variant="primary" onClick={() => navigate(`/dashboard/billing?plan=${p.next_plan}`)}>
              {t('billing.upgrade', { plan: t(`billing.plans.${p.next_plan}`) })}
            </Button>
          )}
          {!p.can_upgrade && p.status === "expired" && (
            <Button variant="primary" loading={renew.isPending} onClick={() => renew.mutate()}>
              {t('billing.renew')}
            </Button>
          )}
          {!p.can_upgrade && p.status === "trial" && (
            <Button variant="primary" onClick={() => navigate('/dashboard/billing')}>
              {t('billing.plan.trialCta')}
            </Button>
          )}
        </div>
      </div>

      {/* Автопродление */}
      <div className="card" style={{ padding: "28px" }}>
        <SectionHeader icon={icons.zap} title={t('billing.autopay.title')} subtitle={t('billing.autopay.subtitle')} />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px" }}>
          <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--onyx)" }}>{t('billing.autopay.autoRenew')}</div>
          <Switch
            checked={p.auto_renewal}
            disabled={setAutopay.isPending}
            onChange={v => setAutopay.mutate({ auto_renewal: v })}
          />
        </div>
        <div style={{ fontSize: "12px", color: "var(--muted)", marginTop: "10px" }}>
          {t('billing.autopay.notifyBefore', { count: p.notify_before_days })}
        </div>
      </div>

      {/* Способ оплаты — read-only, управление на /dashboard/billing (задача 1) */}
      <div className="card" style={{ padding: "28px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
            <div style={{ width: "40px", height: "40px", borderRadius: "12px", background: "rgba(252,174,145,0.12)", color: "var(--peach)", display: "flex", alignItems: "center", justifyContent: "center" }}>{icons.creditCard}</div>
            <div>
              <div style={{ fontSize: "15px", fontWeight: 700, color: "var(--onyx)" }}>{t('billing.payment.title')}</div>
              <div style={{ fontSize: "12px", color: "var(--muted)", marginTop: "2px", fontFamily: card ? "monospace" : "inherit" }}>
                {!cards.isLoading && (card ? t('billing.payment.cardSummary', { last4: card.card_last4 }) : t('billing.payment.notLinked'))}
              </div>
            </div>
          </div>
          <button
            onClick={() => navigate('/dashboard/billing')}
            style={{ padding: "9px 18px", borderRadius: "9px", background: "rgba(252,174,145,0.08)", border: "1px solid rgba(252,174,145,0.2)", color: "var(--peach)", fontSize: "11.5px", fontWeight: 700, cursor: "pointer", transition: "all 0.2s", flexShrink: 0 }}
            onMouseEnter={e => { e.currentTarget.style.background = "var(--peach)"; e.currentTarget.style.color = "white"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "rgba(252,174,145,0.08)"; e.currentTarget.style.color = "var(--peach)"; }}
          >
            {t('billing.payment.change')}
          </button>
        </div>
      </div>

      {/* История платежей — 12 строк, «Показать все» на полную историю (задача 6) */}
      <div className="card" style={{ padding: "28px" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "4px" }}>
          <SectionHeader icon={icons.download} title={t('billing.history.title')} subtitle={t('billing.history.subtitle')} />
          <Button
            size="sm"
            loading={isExporting}
            disabled={invoiceItems.length === 0}
            onClick={onExport}
          >
            {t('billing.history.exportCsv')}
          </Button>
        </div>

        {!invoices.isLoading && invoiceItems.length === 0 && (
          <EmptyState size="sm" icon="money" title={t('billing.history.empty')} />
        )}

        {invoiceItems.length > 0 && (
          <>
            {invoiceItems.map(inv => (
              <div key={inv.id} style={{ display: "flex", alignItems: "center", gap: "14px", padding: "12px 16px", borderRadius: "10px" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--onyx)" }}>
                    {t(`billing.plans.${inv.plan_name}`)} · {t('billing.history.period', { count: inv.period_months })}
                  </div>
                  <div style={{ fontSize: "11px", color: "var(--muted)" }}>{inv.paid_at ? fmtDate(inv.paid_at) : t('billing.history.noDate')}</div>
                </div>
                <div style={{ fontSize: "14px", fontWeight: 700, color: "var(--onyx)", marginRight: "8px" }}>{formatMoney(inv.amount / 100, currency)}</div>
                <StatusBadge type={INVOICE_BADGE[inv.status] ?? "info"}>{t(`billing.history.status.${inv.status}`)}</StatusBadge>
              </div>
            ))}
            {invoiceTotal > invoiceItems.length && (
              <button
                onClick={() => navigate('/dashboard/billing/payments-history')}
                style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "4px", width: "100%", marginTop: "12px", padding: "10px", borderRadius: "9px", border: "1px solid var(--border)", background: "transparent", color: "var(--muted)", fontSize: "12px", fontWeight: 700, cursor: "pointer", transition: "all 0.15s" }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--peach)"; e.currentTarget.style.color = "var(--peach)"; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.color = "var(--muted)"; }}
              >
                {t('billing.history.showAll')} {icons.chevronRight}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
