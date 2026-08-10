import { useTranslation } from 'react-i18next';
import { ModalShell, ModalHeader, ModalBody, ModalFooter, GhostButton, PrimaryButton, useToast } from '../../../../../components/ui/index';
import type { IbanCheckout } from '../../../../../api/billing/billing.types';
import { formatMoney } from '../../../../../lib/money';
import { BankIcon, CreditCardIcon } from '../ui/BillingIcons';
import InvoiceDetailsForm from '../sections/InvoiceDetailsForm';
import type { InvoiceDetails, InvoiceDetailErrors } from '../../hooks/useInvoiceDetails';
import type { PayBranch } from '../../hooks/useBillingCalculator';

interface Props {
  currency?: string;
  branch: PayBranch;
  setBranch: (b: PayBranch) => void;
  ibanData: IbanCheckout | null;
  busy: boolean;
  /** Выбор способа: сам решает, спросить ли сначала реквизиты фактуры. */
  onChoose: (method: 'iban' | 'card') => void;
  onClose: () => void;
  details: { value: InvoiceDetails; patch: (p: Partial<InvoiceDetails>) => void };
  wantInvoice: boolean;
  setWantInvoice: (v: boolean) => void;
  detailErrors: InvoiceDetailErrors;
  /** Ветка перевода: дополнительно нужна страна. У карты — только IČO и DIČ. */
  detailsForIban: boolean;
  onSubmitDetails: () => void;
}

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

// Модалка выбора способа оплаты (эпик B4).
// Перевод — счёт и реквизиты показываются тут же. Карта — сразу редирект на страницу
// Stripe: PAN/CVV в наш фронт не попадают вовсе (PCI), а адрес и индекс Stripe
// собирает сам. Своего экрана с полями карты у нас нет — он был неактивной
// заглушкой, ведущей туда же.
// Шаг реквизитов общий для обеих веток: IČO/DIČ нужны для фактуры и живут в профиле
// студии, Stripe печатает их из Customer'а.
export default function PaymentMethodModal({
  currency, branch, setBranch, ibanData, busy, onChoose, onClose,
  details, wantInvoice, setWantInvoice, detailErrors, detailsForIban, onSubmitDetails,
}: Props) {
  const { t } = useTranslation('billing');

  return (
    <ModalShell onClose={onClose}>
      <ModalHeader title={branch === 'details' ? t('payModal.invoice.title') : t('payModal.title')} />
      <ModalBody>
        {branch === 'choose' && (
          <>
            <div style={{ fontSize: '13px', color: 'var(--muted)' }}>{t('payModal.chooseTitle')}</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <button
                type="button"
                onClick={() => onChoose('iban')}
                disabled={busy}
                style={{ padding: '20px', borderRadius: '14px', border: '1.5px solid var(--border)', background: 'var(--bg-card)', cursor: busy ? 'wait' : 'pointer', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: '10px', opacity: busy ? 0.6 : 1, fontFamily: 'inherit' }}
              >
                <BankIcon />
                <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--onyx)' }}>{t('payModal.iban.label')}</div>
                <div style={{ fontSize: '12px', color: 'var(--muted)' }}>{t('payModal.iban.desc')}</div>
              </button>
              <button
                type="button"
                onClick={() => onChoose('card')}
                disabled={busy}
                style={{ padding: '20px', borderRadius: '14px', border: '1.5px solid var(--border)', background: 'var(--bg-card)', cursor: busy ? 'wait' : 'pointer', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: '10px', opacity: busy ? 0.6 : 1, fontFamily: 'inherit' }}
              >
                <CreditCardIcon />
                <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--onyx)' }}>{t('payModal.card.label')}</div>
                <div style={{ fontSize: '12px', color: 'var(--muted)' }}>{t('payModal.card.desc')}</div>
              </button>
            </div>
          </>
        )}

        {/* Шаг реквизитов: показывается только если IČO (или страна для IBAN) ещё не
            заполнены — заполненные лежат в профиле студии и больше не спрашиваются. */}
        {branch === 'details' && (
          <>
            <div style={{ fontSize: '13px', color: 'var(--muted)', lineHeight: 1.6 }}>
              {t('payModal.invoice.question')}
            </div>
            <InvoiceDetailsForm
              value={details.value}
              patch={details.patch}
              wantInvoice={wantInvoice}
              setWantInvoice={setWantInvoice}
              requireCountry={detailsForIban}
              // Страну и индекс показываем ТОЛЬКО для перевода. На карточной ветке
              // их собирает сама страница Stripe (billing_address_collection) и
              // пишет обратно в Customer — спрашивать здесь значит просить дважды.
              // IČO и DIČ остаются в обеих ветках: без них не выписать фактуру.
              showAddress={detailsForIban}
              errors={detailErrors}
            />
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
              {/* BIC требуют не все банки, но без него часть форм перевода не отправляется. */}
              {ibanData.bic && <CopyRow label={t('payModal.bicLabel')} value={ibanData.bic} />}
              <CopyRow label={t('payModal.referenceLabel')} value={ibanData.reference} />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0' }}>
                <span style={{ fontSize: '11px', color: 'var(--muted)' }}>{t('payModal.amountLabel')}</span>
                <span style={{ fontSize: '15px', fontWeight: 800, color: 'var(--onyx)' }}>{formatMoney(ibanData.amount / 100, currency)}</span>
              </div>
            </div>
            <div style={{ padding: '12px 16px', background: 'rgba(163,201,168,0.1)', border: '1px solid rgba(163,201,168,0.25)', borderRadius: '12px', fontSize: '12px', color: 'var(--muted)', lineHeight: '1.6' }}>
              {t('payModal.ibanNote')}
            </div>
            {/* Фактура уже ушла на почту студии, но бухгалтерии часто нужна прямо сейчас. */}
            {ibanData.hosted_invoice_url && (
              <a
                href={ibanData.hosted_invoice_url}
                target="_blank"
                rel="noopener noreferrer"
                style={{ fontSize: '13px', fontWeight: 700, color: 'var(--peach)', textDecoration: 'none' }}
              >
                {t('payModal.openInvoice')}
              </a>
            )}
          </>
        )}

      </ModalBody>
      <ModalFooter>
        {branch === 'choose' && <GhostButton>{t('common:cancel')}</GhostButton>}
        {branch === 'details' && (
          <>
            <GhostButton onClick={() => setBranch('choose')}>{t('payModal.back')}</GhostButton>
            <PrimaryButton onClick={onSubmitDetails} loading={busy}>{t('payModal.invoice.continue')}</PrimaryButton>
          </>
        )}
        {branch === 'iban' && <GhostButton onClick={() => setBranch('choose')}>{t('payModal.back')}</GhostButton>}
      </ModalFooter>
    </ModalShell>
  );
}
