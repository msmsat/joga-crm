import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import '../../Billing.module.css';
import type { BillingPlan, PaymentCard, AutopaySettings } from '../../../../../api/billing/billing.types';
import { Button, Switch } from '../../../../../components/ui/index';
import { CheckIcon, ShieldIcon, CreditCardIcon, BankIcon } from '../ui/BillingIcons';
import InvoiceDetailsForm from '../sections/InvoiceDetailsForm';
import type { InvoiceDetails, InvoiceDetailErrors } from '../../hooks/useInvoiceDetails';

const SECURITY_KEYS = ['pciDss', 'secure3d', 'noStorage', 'autoLink'] as const;
const AUTOPAY_FIELDS = [
  { key: 'autoRenew',   field: 'auto_renewal' as const },
  { key: 'emailNotify', field: 'email_receipt_enabled' as const },
  { key: 'remind3d',    field: 'notify_before_autocharge' as const },
  { key: 'sms',         field: 'sms_notification_enabled' as const },
] satisfies { key: string; field: keyof AutopaySettings }[];

interface Props {
  cards: PaymentCard[];
  loaded: boolean;
  plan: BillingPlan | null;
  setAutopay: (field: keyof AutopaySettings, value: boolean) => void;
  details: { value: InvoiceDetails; patch: (p: Partial<InvoiceDetails>) => void; dirty: boolean };
  detailErrors: InvoiceDetailErrors;
  saveDetails: () => void;
}

export default function PaymentMethodTab({
  cards, loaded, plan, setAutopay, details, detailErrors, saveDetails,
}: Props) {
  const { t } = useTranslation('billing');
  // Тумблер «нужна фактура» тут значит «реквизиты компании заполнены»: заполненные
  // показываем сразу открытыми, пустые — за выключенным тумблером, чтобы карточка
  // не выглядела формой с обязательными полями у физлица.
  // Производное состояние, а не useState(значение): реквизиты приезжают запросом
  // ПОСЛЕ первого рендера, и начальное значение навсегда осталось бы false.
  const [wantOverride, setWantOverride] = useState<boolean | null>(null);
  const wantInvoice = wantOverride ?? !!details.value.company_id;

  // Карта, сохранённая у Stripe: показываем основную, иначе первую сохранённую.
  const card = cards.find(c => c.is_primary) ?? cards[0] ?? null;
  // Автосписание доступно только при оплате картой (аудит §4) — бэк дублирует запрет.
  const canAutopay = card?.method_type === 'card';

  return (
    <div style={{ padding: '0 var(--card-pad)', animation: 'fadeSlideIn 0.4s ease forwards' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(300px, 100%), 1fr))', gap: 'calc(var(--grid-gap) * 2)', alignItems: 'start' }}>

          {/* Токен-бейдж (эпик B4, §5) — вместо отрисовки номера карты: PAN/CVV/держатель
              нигде не хранятся и не показываются, только брендинг + маскированный хвост токена. */}
          <div style={{
            width: '100%', borderRadius: '20px', background: 'var(--bg-card)',
            border: '1px solid var(--border)', boxShadow: 'var(--shadow)',
            padding: '28px', boxSizing: 'border-box',
            display: 'flex', flexDirection: 'column', gap: '18px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <ShieldIcon />
              <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--onyx)' }}>{t('method.badgeTitle')}</span>
            </div>

            <div style={{ padding: '16px 18px', borderRadius: '14px', background: 'var(--bg)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '12px' }}>
              {card?.method_type === 'iban' ? <BankIcon /> : <CreditCardIcon />}
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--onyx)', fontFamily: card ? "'SF Mono', 'Consolas', monospace" : 'inherit' }}>
                  {card?.method_type === 'iban'
                    ? t('method.ibanBadgeLabel')
                    : card
                    ? `${card.card_brand} · tok_••••${card.card_last4}`
                    : t('method.notLinked')}
                </div>
                {card?.method_type === 'card' && (
                  <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '2px' }}>
                    {t('method.tokenSub', { expiry: card.card_expiry })}
                  </div>
                )}
              </div>
            </div>

            {card && (
              <div style={{ fontSize: '11.5px', color: 'var(--muted)', lineHeight: '1.6' }}>
                {card.method_type === 'iban' ? t('method.ibanBadgeNote') : t('method.tokenNote')}
              </div>
            )}

            {/* Кнопки «Продлить» здесь больше нет: подписку продлевает Stripe сам,
                а POST /billing/renew отвечает 410. */}
          </div>

          {/* Right column: защита + продление */}
          <div style={{ minWidth: 0, width: '100%', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ padding: '24px 28px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '20px', boxShadow: 'var(--shadow)', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--pistachio)" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
                <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--onyx)' }}>{t('method.securityTitle')}</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 24px' }}>
                {SECURITY_KEYS.map(key => (
                  <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12.5px', color: 'var(--muted)' }}>
                    <CheckIcon size={14} /> {t(`method.security.${key}`)}
                  </div>
                ))}
              </div>
            </div>

            {loaded && !card && (
              <div style={{ padding: '16px 20px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '14px', fontSize: '12.5px', color: 'var(--muted)', lineHeight: 1.5 }}>
                {t('empty.noCard')} {t('method.noCardDetail')}
              </div>
            )}
          </div>
        </div>

        {/* Реквизиты фактуры — заполняются ЗАРАНЕЕ, чтобы оплата не спрашивала их
            в модалке. Та же форма, что и на шаге 'details' (общий компонент). */}
        <div style={{ marginTop: '12px', padding: '24px 28px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '20px', boxShadow: 'var(--shadow)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="var(--peach)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 2h7l3 3v13H5z" /><path d="M8 8h4M8 11h4M8 14h2" />
            </svg>
            <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--onyx)' }}>{t('method.details.title')}</span>
          </div>
          <div style={{ fontSize: '12px', color: 'var(--muted)', lineHeight: 1.6, marginBottom: '18px' }}>
            {t('method.details.subtitle')}
          </div>
          <InvoiceDetailsForm
            value={details.value}
            patch={details.patch}
            wantInvoice={wantInvoice}
            setWantInvoice={setWantOverride}
            requireCountry={false}
            // Здесь реквизиты заполняют ЗАРАНЕЕ, вне оплаты: адрес показываем всегда,
            // чтобы студия могла закрыть его до того, как понадобится счёт по IBAN.
            showAddress
            errors={detailErrors}
          />
          <div style={{ marginTop: '18px', display: 'flex', justifyContent: 'flex-end' }}>
            <Button variant="primary" disabled={!details.dirty} onClick={saveDetails}>
              {t('method.details.save')}
            </Button>
          </div>
        </div>

        {/* Autopayment settings */}
        <div style={{ marginTop: '12px', padding: '24px 28px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '20px', boxShadow: 'var(--shadow)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M11 2L3 11H10L9 18L17 9H10L11 2Z" fill="var(--peach)" fillOpacity="0.2" stroke="var(--peach)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
            <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--onyx)' }}>{t('method.autopayTitle')}</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(200px, 100%), 1fr))', gap: '12px' }}>
            {AUTOPAY_FIELDS.map(({ key, field }) => {
              const disabled = !canAutopay || !plan;
              return (
                <div key={key} style={{ padding: '16px 18px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--onyx)', marginBottom: '2px' }}>{t(`method.autopay.${key}.label`)}</div>
                    <div style={{ fontSize: '11px', color: 'var(--muted)' }}>{!canAutopay ? t('method.autopay.cardOnly') : t(`method.autopay.${key}.desc`)}</div>
                  </div>
                  <Switch checked={!!plan?.[field]} onChange={v => setAutopay(field, v)} disabled={disabled} />
                </div>
              );
            })}
          </div>
        </div>

      </div>
    </div>
  );
}
