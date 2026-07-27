import { useTranslation } from 'react-i18next';
import { ModalShell, ModalHeader, ModalBody, ModalFooter, GhostButton, PrimaryButton, Input, useToast } from '../../../../../components/ui/index';
import type { IbanCheckout } from '../../../../../api/billing/billing.types';
import { formatMoney } from '../../../../../lib/money';
import { BankIcon, CreditCardIcon } from '../ui/BillingIcons';

interface Props {
  currency?: string;
  branch: 'choose' | 'iban' | 'card';
  setBranch: (b: 'choose' | 'iban' | 'card') => void;
  ibanData: IbanCheckout | null;
  busy: boolean;
  onChooseIban: () => void;
  onPayCard: () => void;
  onClose: () => void;
}

// Тестовый контур: настоящей интеграции Apple/Google Pay нет (Payment Request API) —
// обе кнопки ведут на тот же Fondy checkout_url, что и «Оплатить картой» (аудит §4).
const hasApplePay = typeof window !== 'undefined' && 'ApplePaySession' in window;

function CopyRow({ label, value }: { label: string; value: string }) {
  const { t } = useTranslation('billing');
  const toast = useToast();
  const copy = () => {
    navigator.clipboard.writeText(value);
    toast.success(t('payModal.copied'));
  };
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '2px' }}>{label}</div>
        <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--onyx)', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</div>
      </div>
      <button
        type="button"
        onClick={copy}
        style={{ flexShrink: 0, padding: '6px 12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--peach)', fontSize: '12px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
      >
        {t('payModal.copy')}
      </button>
    </div>
  );
}

// Модалка выбора способа оплаты (эпик B4): заменяет прямой редирект на Fondy.
// IBAN — тестовый инвойс+реквизиты показываются тут же; Карта — редирект на Fondy
// (реквизиты вводятся там, PAN/CVV в наш фронт не попадают — PCI, §5).
export default function PaymentMethodModal({ currency, branch, setBranch, ibanData, busy, onChooseIban, onPayCard, onClose }: Props) {
  const { t } = useTranslation('billing');

  return (
    <ModalShell onClose={onClose}>
      <ModalHeader title={t('payModal.title')} />
      <ModalBody>
        {branch === 'choose' && (
          <>
            <div style={{ fontSize: '13px', color: 'var(--muted)' }}>{t('payModal.chooseTitle')}</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <button
                type="button"
                onClick={onChooseIban}
                disabled={busy}
                style={{ padding: '20px', borderRadius: '14px', border: '1.5px solid var(--border)', background: 'var(--bg-card)', cursor: busy ? 'wait' : 'pointer', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: '10px', opacity: busy ? 0.6 : 1, fontFamily: 'inherit' }}
              >
                <BankIcon />
                <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--onyx)' }}>{t('payModal.iban.label')}</div>
                <div style={{ fontSize: '12px', color: 'var(--muted)' }}>{t('payModal.iban.desc')}</div>
              </button>
              <button
                type="button"
                onClick={() => setBranch('card')}
                style={{ padding: '20px', borderRadius: '14px', border: '1.5px solid var(--border)', background: 'var(--bg-card)', cursor: 'pointer', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: '10px', fontFamily: 'inherit' }}
              >
                <CreditCardIcon />
                <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--onyx)' }}>{t('payModal.card.label')}</div>
                <div style={{ fontSize: '12px', color: 'var(--muted)' }}>{t('payModal.card.desc')}</div>
              </button>
            </div>
          </>
        )}

        {branch === 'iban' && ibanData && (
          <>
            <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--onyx)' }}>
              {t('payModal.invoiceTitle', { number: ibanData.invoice_number })}
            </div>
            <div>
              <CopyRow label={t('payModal.beneficiary')} value={ibanData.beneficiary} />
              <CopyRow label={t('payModal.ibanLabel')} value={ibanData.iban} />
              <CopyRow label={t('payModal.referenceLabel')} value={ibanData.reference} />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0' }}>
                <span style={{ fontSize: '11px', color: 'var(--muted)' }}>{t('payModal.amountLabel')}</span>
                <span style={{ fontSize: '15px', fontWeight: 800, color: 'var(--onyx)' }}>{formatMoney(ibanData.amount / 100, currency)}</span>
              </div>
            </div>
            <div style={{ padding: '12px 16px', background: 'rgba(163,201,168,0.1)', border: '1px solid rgba(163,201,168,0.25)', borderRadius: '12px', fontSize: '12px', color: 'var(--muted)', lineHeight: '1.6' }}>
              {t('payModal.ibanNote')}
            </div>
          </>
        )}

        {branch === 'card' && (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {hasApplePay && (
                <button
                  type="button"
                  onClick={onPayCard}
                  disabled={busy}
                  style={{ padding: '14px', borderRadius: '12px', border: 'none', background: '#000', color: '#fff', fontSize: '14px', fontWeight: 700, cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.6 : 1, fontFamily: 'inherit' }}
                >
                  {t('payModal.applePay')}
                </button>
              )}
              <button
                type="button"
                onClick={onPayCard}
                disabled={busy}
                style={{ padding: '14px', borderRadius: '12px', border: '1.5px solid var(--border)', background: 'var(--bg-card)', color: 'var(--onyx)', fontSize: '14px', fontWeight: 700, cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.6 : 1, fontFamily: 'inherit' }}
              >
                {t('payModal.googlePay')}
              </button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
              <span style={{ fontSize: '11px', color: 'var(--muted)' }}>{t('payModal.or')}</span>
              <div style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
            </div>

            {/* Превью-заглушка полей карты (§4/§5): недоступны для ввода — реквизиты
                вводятся на защищённой странице Fondy, submit туда и уводит. */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <Input label={t('payModal.cardNumber')} value="" onChange={() => {}} placeholder="•••• •••• •••• ••••" disabled monospace />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <Input label={t('payModal.expiry')} value="" onChange={() => {}} placeholder="••/••" disabled monospace />
                <Input label={t('payModal.cvv')} value="" onChange={() => {}} placeholder="•••" disabled monospace />
              </div>
              <div style={{ fontSize: '11px', color: 'var(--muted)', lineHeight: '1.5' }}>{t('payModal.cardFormNote')}</div>
            </div>
          </>
        )}
      </ModalBody>
      <ModalFooter>
        {branch === 'choose' && <GhostButton>{t('common:cancel')}</GhostButton>}
        {branch === 'iban' && <GhostButton onClick={() => setBranch('choose')}>{t('payModal.back')}</GhostButton>}
        {branch === 'card' && (
          <>
            <GhostButton onClick={() => setBranch('choose')}>{t('payModal.back')}</GhostButton>
            <PrimaryButton onClick={onPayCard} loading={busy}>{t('payModal.payWithCard')}</PrimaryButton>
          </>
        )}
      </ModalFooter>
    </ModalShell>
  );
}
