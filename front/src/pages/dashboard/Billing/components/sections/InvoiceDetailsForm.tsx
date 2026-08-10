import { useTranslation } from 'react-i18next';
import { Input, Switch } from '../../../../../components/ui/index';
import type { InvoiceDetails, InvoiceDetailErrors } from '../../hooks/useInvoiceDetails';

interface Props {
  value: InvoiceDetails;
  patch: (p: Partial<InvoiceDetails>) => void;
  wantInvoice: boolean;
  setWantInvoice: (v: boolean) => void;
  /** IBAN требует страну и индекс даже без фактуры: по ним Stripe Tax считает ставку VAT. */
  requireCountry: boolean;
  /** Показывать ли страну и индекс вообще. На карточной ветке — нет: адрес
   *  плательщика собирает сама страница Stripe (billing_address_collection),
   *  и спрашивать его дважды значит просить лишнее перед оплатой. */
  showAddress: boolean;
  errors: InvoiceDetailErrors;
}

export default function InvoiceDetailsForm({
  value, patch, wantInvoice, setWantInvoice, requireCountry, showAddress, errors,
}: Props) {
  const { t } = useTranslation('billing');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', padding: '14px 16px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '12px' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--onyx)', marginBottom: '2px' }}>
            {t('payModal.invoice.need')}
          </div>
          <div style={{ fontSize: '11.5px', color: 'var(--muted)', lineHeight: 1.5 }}>
            {t('payModal.invoice.needHint')}
          </div>
        </div>
        <Switch
          checked={wantInvoice}
          // Выключили — реквизиты компании не уезжают на сервер: пустая строка равна
          // сохранённой пустой, и save() их просто не отправит.
          onChange={v => { setWantInvoice(v); if (!v) patch({ company_id: '', vat_id: '' }); }}
        />
      </div>

      {wantInvoice && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <div>
            <Input
              label={t('payModal.invoice.icoLabel')}
              value={value.company_id}
              onChange={v => patch({ company_id: v })}
              placeholder="12345678"
              error={errors.company_id}
              monospace
            />
            {/* Реквизит называется по-своему в каждой стране (IČO, HRB, KRS…) —
                подпись поля нейтральная, а подсказка показывает местные имена,
                иначе владелец не понимает, какой номер у него просят. */}
            <div style={{ fontSize: '11px', color: 'var(--muted)', lineHeight: 1.45, marginTop: '5px' }}>
              {t('payModal.invoice.icoHint')}
            </div>
          </div>
          <div>
            <Input
              label={t('payModal.invoice.vatLabel')}
              value={value.vat_id}
              onChange={v => patch({ vat_id: v })}
              placeholder="CZ12345678"
              monospace
            />
            <div style={{ fontSize: '11px', color: 'var(--muted)', lineHeight: 1.45, marginTop: '5px' }}>
              {t('payModal.invoice.vatHint')}
            </div>
          </div>
        </div>
      )}

      {showAddress && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <Input
            label={t('payModal.invoice.countryLabel')}
            value={value.country}
            onChange={v => patch({ country: v.toUpperCase().slice(0, 2) })}
            placeholder="CZ"
            error={errors.country}
            monospace
          />
          <Input
            label={t('payModal.invoice.postalLabel')}
            value={value.postal_code}
            onChange={v => patch({ postal_code: v })}
            placeholder="11000"
            error={errors.postal_code}
            monospace
          />
        </div>
      )}

      <div style={{ fontSize: '11.5px', color: 'var(--muted)', lineHeight: 1.6 }}>
        {requireCountry ? t('payModal.invoice.countryNote') : t('payModal.invoice.note')}
      </div>
    </div>
  );
}
