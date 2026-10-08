import { useEffect, useState, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { hybridApi } from '../../api/hybrid.api';
import type { ClientConfirmPayment, PaymentPreviewRead } from '../../api/hybrid.types';
import type { StudioInfo } from '../../api/studio';
import type { PayMethod } from '../../hooks/useBookingWizard';
import { money } from '../../lib/money';
import { cn } from '../../lib/utils';
import SettingRow from '../profile/SettingRow';
import { Sheet, SheetAction } from '../ui/Sheet';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  quoteId: string | null;
  subtitle: string;
  studio?: Pick<StudioInfo, 'name' | 'logo_url'>;
  /** Студия принимает оплату онлайн (подключён Stripe). */
  canPayOnline: boolean;
  /** «Предоплата при записи»: на месте без абонемента не записывают. */
  venueAllowed: boolean;
  saving: boolean;
  onPay: (method: PayMethod, payment: ClientConfirmPayment | null) => void;
};

// 16px — порог iOS: при фокусе в поле с кеглем меньше Safari увеличивает страницу.
const inputClass =
  'w-full rounded-[16px] bg-background px-4 py-3.5 text-[16px] font-semibold text-foreground ' +
  'placeholder:font-medium placeholder:text-muted-foreground/70 outline-none ' +
  'ring-1 ring-inset ring-transparent transition focus:ring-brand/50 disabled:opacity-50';

function MethodTile({ active, disabled, icon, title, hint, onClick }: {
  active: boolean; disabled?: boolean; icon: ReactNode; title: string; hint: string; onClick: () => void;
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      whileTap={disabled ? undefined : { scale: 0.97 }}
      className={cn(
        'flex flex-1 flex-col items-start gap-2.5 rounded-[20px] px-4 py-4 text-left transition-shadow duration-200 disabled:opacity-45',
        active ? 'bg-card shadow-soft ring-2 ring-brand' : 'bg-background',
      )}
    >
      <span className={cn('flex h-10 w-10 items-center justify-center rounded-full',
        active ? 'bg-brand text-brand-foreground' : 'bg-card text-foreground')}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
          {icon}
        </svg>
      </span>
      <span>
        <span className="block text-[14.5px] font-extrabold tracking-[-0.015em] text-card-foreground">{title}</span>
        <span className="mt-0.5 block text-[12px] font-semibold leading-snug text-muted-foreground">{hint}</span>
      </span>
    </motion.button>
  );
}

/**
 * «Оплатить» на итоге записи: как платить — на месте или онлайн — и чем ещё:
 * промокод, ваучер (подарочный сертификат), баллы, депозит.
 *
 * СЧИТАЕТ ТОЛЬКО СЕРВЕР (`payment-preview`, тот же расчёт, что у кассы):
 * коды набирают по букве, запрос уходит с задержкой, старые ответы гасит номер
 * запроса. На месте коды не гасятся, а держатся на брони — администратор у
 * стойки увидит сумму уже с ними; онлайн — форма Stripe на остаток.
 *
 * На сервер уходят только те коды, что правда сработали в чеке: промокод,
 * признанный недействительным, или чужой ваучер не должны превратить запись в
 * отказ — чек и так показал, что они не применились.
 */
export default function WizardPaySheet({ isOpen, onClose, quoteId, subtitle, studio, canPayOnline, venueAllowed, saving, onPay }: Props) {
  const { t, i18n } = useTranslation();
  // Онлайн — сразу, если студия его принимает: заплатил и записан, без долга
  // у стойки. «На месте» остаётся выбором человека, а не умолчанием.
  const [method, setMethod] = useState<PayMethod>(canPayOnline || !venueAllowed ? 'card' : 'venue');
  const [promo, setPromo] = useState('');
  const [certificate, setCertificate] = useState('');
  const [useBonuses, setUseBonuses] = useState(false);
  const [useDeposit, setUseDeposit] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const previewKey = JSON.stringify([quoteId, promo, certificate, useBonuses, useDeposit, attempt]);
  const [preview, setPreview] = useState<{ key: string; data: PaymentPreviewRead | null; error: boolean } | null>(null);

  useEffect(() => {
    if (!isOpen || !quoteId) return;
    let disposed = false;
    const timer = setTimeout(() => {
      hybridApi.paymentPreview(quoteId, {
        promo_code: promo.trim() || null, certificate_code: certificate.trim() || null,
        use_bonuses: useBonuses, use_deposit: useDeposit,
      })
        .then((data) => { if (!disposed) setPreview({ key: previewKey, data, error: false }); })
        .catch(() => { if (!disposed) setPreview({ key: previewKey, data: null, error: true }); });
    }, 300);
    return () => { disposed = true; clearTimeout(timer); setPreview(null); };
  }, [isOpen, quoteId, promo, certificate, useBonuses, useDeposit, previewKey]);

  const current = isOpen && preview?.key === previewKey ? preview : null;
  const check = current?.data ?? null;
  const calculating = isOpen && Boolean(quoteId) && current === null;
  const calculationError = current?.error ?? false;
  const nothingToPay = check !== null && check.total === 0;
  // Платить нечего — остаётся «на месте» (записать без денег); иначе выбор
  // человека, а при предоплате студии — только онлайн.
  const online = canPayOnline && !nothingToPay && (method === 'card' || !venueAllowed);
  const fmt = (amount: number) => money(amount, check?.currency ?? 'EUR', i18n.language);
  const promoRejected = promo.trim().length > 0 && check !== null && check.promo_valid === false;
  const certificateRejected = certificate.trim().length > 0 && check !== null && check.certificate_error !== null;

  const pay = () => {
    if (saving || calculating || !check || !quoteId || calculationError) return;
    const payment: ClientConfirmPayment | null = check ? {
      promo_code: promo.trim() && check.promo_valid ? promo.trim() : null,
      certificate_code: check.certificate_applied > 0 ? certificate.trim() : null,
      use_bonuses: check.bonuses_applied > 0,
      use_deposit: check.deposit_applied > 0,
      expected_total: check.total,
    } : null;
    onPay(online ? 'card' : 'venue', payment);
  };

  const rows: { label: string; value: string; brand?: boolean }[] = [];
  if (check) {
    for (const discount of check.discounts) {
      rows.push({ label: t(`pay.discount.${discount.kind}`), value: `−${fmt(discount.amount)}`, brand: true });
    }
    if (check.certificate_applied > 0) rows.push({ label: t('paymentModal.certificate'), value: `−${fmt(check.certificate_applied)}`, brand: true });
    if (check.deposit_applied > 0) rows.push({ label: t('paymentModal.deposit'), value: `−${fmt(check.deposit_applied)}`, brand: true });
    if (check.bonuses_applied > 0) {
      rows.push({ label: t('paymentModal.bonuses_spent', { count: check.bonuses_applied }), value: `−${fmt(check.bonuses_value)}`, brand: true });
    }
  }

  const label = check === null ? t('pay.confirm')
    : online ? t('pay.goToPayment', { amount: fmt(check.total) })
    : nothingToPay ? t('pay.confirm')
    : t('pay.confirmVenue', { amount: fmt(check.total) });

  return (
    <Sheet
      isOpen={isOpen}
      onClose={saving ? () => undefined : onClose}
      layer={3}
      kicker={t('pay.kicker')}
      title={t('pay.title')}
      subtitle={subtitle}
      footer={
        <SheetAction onClick={pay} disabled={saving || calculating || !quoteId || !check || calculationError}>
          {saving ? t('resource.confirming') : calculating ? t('paymentModal.calculating') : label}
        </SheetAction>
      }
    >
      {studio && (
        <div className="mb-5 flex items-center gap-3">
          {studio.logo_url && <img src={studio.logo_url} alt="" className="h-11 w-11 rounded-[14px] object-contain ring-1 ring-border" />}
          <p className="min-w-0 text-[14px] font-extrabold text-foreground [overflow-wrap:anywhere]">{studio.name}</p>
        </div>
      )}
      <div className="flex gap-2.5">
        <MethodTile
          active={!online}
          disabled={saving || (!venueAllowed && !nothingToPay)}
          icon={<><rect x="2.5" y="6" width="19" height="12" rx="2.5" /><circle cx="12" cy="12" r="2.6" /><path d="M6 9.5v5M18 9.5v5" /></>}
          title={t('pay.venue')}
          hint={venueAllowed || nothingToPay ? t('pay.venueHint') : t('pay.prepayOnly')}
          onClick={() => setMethod('venue')}
        />
        <MethodTile
          active={online}
          disabled={saving || !canPayOnline || nothingToPay}
          icon={<><rect x="2.5" y="5" width="19" height="14" rx="2.5" /><path d="M2.5 10h19M6.5 15h4" /></>}
          title={t('pay.online')}
          hint={!canPayOnline ? t('pay.onlineUnavailable') : nothingToPay ? t('pay.nothingOnline') : t('pay.onlineHint')}
          onClick={() => setMethod('card')}
        />
      </div>

      <div className="pt-6 pb-2.5 text-[13px] font-bold text-muted-foreground">
        {t('pay.codes')}
      </div>
      <div className="flex flex-col gap-2.5">
        <div>
          <input
            type="text" value={promo} onChange={(e) => setPromo(e.target.value.toUpperCase())}
            placeholder={t('paymentModal.promo_placeholder')} disabled={saving}
            aria-label={t('paymentModal.promo_placeholder')} aria-invalid={promoRejected}
            autoCapitalize="characters" autoComplete="off" spellCheck={false} className={inputClass}
          />
          {promoRejected && <div className="mt-1.5 px-1 text-[11.5px] font-semibold text-danger">{t('paymentModal.promo_invalid')}</div>}
          {check?.promo_outweighed && <div className="mt-1.5 px-1 text-[11.5px] font-semibold text-muted-foreground">{t('pay.promoOutweighed')}</div>}
        </div>
        <div>
          <input
            type="text" value={certificate} onChange={(e) => setCertificate(e.target.value.toUpperCase())}
            placeholder={t('pay.voucherPlaceholder')} disabled={saving}
            aria-label={t('pay.voucherPlaceholder')} aria-invalid={certificateRejected}
            autoCapitalize="characters" autoComplete="off" spellCheck={false} className={inputClass}
          />
          {certificateRejected && <div className="mt-1.5 px-1 text-[11.5px] font-semibold text-danger">{t('paymentModal.certificate_invalid')}</div>}
        </div>
        {check !== null && check.bonuses_available > 0 && (
          <SettingRow
            icon={<path d="M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.5 9.2l5.9-.9z" />}
            label={t('pay.useBonuses', { value: fmt(check.bonuses_available * check.point_value) })}
            toggle checked={useBonuses} onClick={() => !saving && setUseBonuses(!useBonuses)}
          />
        )}
        {check !== null && check.deposit_available > 0 && (
          <SettingRow
            icon={<path d="M3 7h18v10H3zM3 11h18" />}
            label={t('pay.useDeposit', { value: fmt(check.deposit_available) })}
            toggle checked={useDeposit} onClick={() => !saving && setUseDeposit(!useDeposit)}
          />
        )}
      </div>

      <div className="mt-5 rounded-[20px] bg-background px-4 py-4" aria-busy={calculating}>
        <div className="flex items-start justify-between gap-4">
          <span className="text-[12.5px] font-medium text-muted-foreground">{t('paymentModal.base_price')}</span>
          <span className={cn('text-right text-[13px] font-bold tabular-nums', rows.length ? 'text-muted-foreground line-through' : 'text-foreground')}>
            {check ? fmt(check.base_price) : '—'}
          </span>
        </div>
        {rows.map((row) => (
          <div key={row.label} className="mt-2.5 flex items-start justify-between gap-4">
            <span className="text-[12.5px] font-medium text-muted-foreground">{row.label}</span>
            <span className="text-right text-[13px] font-extrabold tabular-nums text-brand">{row.value}</span>
          </div>
        ))}
        <div className="my-3.5 border-t border-dashed border-foreground/12" />
        <div className="flex items-center justify-between gap-4">
          <span className="text-[13px] font-bold text-foreground">{t('paymentModal.amount_due')}</span>
          <span className={cn('text-[21px] font-extrabold tabular-nums tracking-[-0.03em] text-foreground', calculating && 'opacity-50')}>
            {check ? fmt(check.total) : '—'}
          </span>
        </div>
        {check !== null && check.points_to_earn > 0 && (
          <div className="mt-2 text-[12px] font-semibold text-muted-foreground">{t('pay.pointsToEarn', { count: check.points_to_earn })}</div>
        )}
      </div>

      {calculating && <p role="status" className="mt-3 text-[12px] font-semibold text-muted-foreground">{t('paymentModal.calculating')}</p>}
      {calculationError && (
        <div role="alert" className="mt-3 rounded-2xl bg-danger/10 p-4 text-[13px] font-medium text-foreground">
          <p>{t('paymentModal.calculation_error')}</p>
          <button type="button" onClick={() => setAttempt(value => value + 1)} className="mt-2 font-bold underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-brand">{t('booking.retry')}</button>
        </div>
      )}
      <p className="px-1 pt-3 text-[12px] font-medium leading-relaxed text-muted-foreground">
        {online ? t('paymentModal.secure_hint') : t('pay.venueNote')}
      </p>
    </Sheet>
  );
}
