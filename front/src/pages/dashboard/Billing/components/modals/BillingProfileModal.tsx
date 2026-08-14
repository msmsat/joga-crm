import { useTranslation } from 'react-i18next';
import type { BillingProfile, BillingProfileInput } from '../../../../../api/billing/billing.types';
import {
  ModalShell, ModalHeader, ModalBody, ModalFooter, GhostButton, PrimaryButton, Input,
} from '../../../../../components/ui/index';
import { Select } from '../../../../../components/ui/Select';
import { useCountryName, useCountryOptions, useProfileDraft } from '../../hooks/useProfileDraft';
import type { ProfileDraft } from '../../hooks/useProfileDraft';

/** Сетка полей реквизитов. Одна и та же в модалке и во вкладке «Способ оплаты». */
export function BillingProfileFields({ draft }: { draft: ProfileDraft }) {
  const { t } = useTranslation('billing');
  const countries = useCountryOptions();
  const { values, set, errors, showErrors } = draft;
  const err = (field: keyof typeof errors) => (showErrors ? errors[field] : undefined);

  const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--text3)',
    letterSpacing: '0.6px', textTransform: 'uppercase', marginBottom: '7px',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div>
        <label style={labelStyle}>{t('profile.fields.country')}</label>
        <Select
          value={values.country}
          options={countries}
          onChange={set('country')}
          placeholder={t('profile.fields.countryPlaceholder')}
        />
        {err('country') && (
          <div style={{ fontSize: '11.5px', color: '#D88C9A', fontWeight: 600, marginTop: '6px' }}>
            {err('country')}
          </div>
        )}
      </div>

      <Input
        label={t('profile.fields.line1')}
        value={values.line1}
        onChange={set('line1')}
        placeholder={t('profile.fields.line1Placeholder')}
        error={err('line1')}
      />

      <Input
        label={t('profile.fields.line2')}
        value={values.line2}
        onChange={set('line2')}
        placeholder={t('profile.fields.line2Placeholder')}
      />

      {/* Индекс и город — в одну строку: короткие поля во всю ширину выглядят
          обрубками, а вместе читаются одним адресом. */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 0.8fr) minmax(0, 1.2fr)', gap: '14px' }}>
        <Input
          label={t('profile.fields.postalCode')}
          value={values.postal_code}
          onChange={set('postal_code')}
          placeholder={t('profile.fields.postalCodePlaceholder')}
          error={err('postal_code')}
        />
        <Input
          label={t('profile.fields.city')}
          value={values.city}
          onChange={set('city')}
          placeholder={t('profile.fields.cityPlaceholder')}
          error={err('city')}
        />
      </div>

      <div>
        <Input
          label={t('profile.fields.vat')}
          value={values.vat_id}
          onChange={v => set('vat_id')(v.toUpperCase())}
          placeholder={t('profile.fields.vatPlaceholder')}
          monospace
        />
        <div style={{ fontSize: '11.5px', color: 'var(--muted)', lineHeight: 1.55, marginTop: '7px' }}>
          {t('profile.fields.vatHint')}
        </div>
      </div>
    </div>
  );
}

/** Живое превью фактуры в левой колонке: адрес виден ровно так, как встанет в счёт. */
function InvoicePreview({ draft }: { draft: ProfileDraft }) {
  const { t } = useTranslation('billing');
  const { values } = draft;
  const countryName = useCountryName(values.country);

  const lines = [
    values.line1.trim(),
    values.line2.trim(),
    [values.postal_code.trim(), values.city.trim()].filter(Boolean).join(' '),
    countryName,
  ].filter(Boolean);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px', width: '100%' }}>
      <div style={{
        width: '100%', borderRadius: '16px', overflow: 'hidden',
        background: 'var(--bg-card, #fff)', border: '1px solid var(--border, #F0EDE8)',
        boxShadow: '0 8px 24px -4px rgba(26,26,26,0.06)',
      }}>
        <div style={{ height: '6px', background: 'linear-gradient(90deg, #FCAE91, #F9A08B)' }} />
        <div style={{ padding: '18px 20px 20px' }}>
          <div style={{
            fontSize: '10px', fontWeight: 800, letterSpacing: '1.2px',
            textTransform: 'uppercase', color: 'var(--text3, #AAA)',
          }}>
            {t('profile.preview.invoice')}
          </div>

          <div style={{
            marginTop: '14px', fontSize: '10px', fontWeight: 800, letterSpacing: '0.8px',
            textTransform: 'uppercase', color: 'var(--text3, #AAA)',
          }}>
            {t('profile.preview.billTo')}
          </div>

          <div style={{ marginTop: '8px', minHeight: '74px' }}>
            {lines.length ? (
              lines.map((line, i) => (
                <div key={i} style={{
                  fontSize: '13px', lineHeight: 1.6,
                  fontWeight: i === 0 ? 700 : 500,
                  color: i === 0 ? 'var(--onyx, #1A1A1A)' : 'var(--muted, #666)',
                }}>
                  {line}
                </div>
              ))
            ) : (
              // Пустые «строки» вместо пустоты: карточка не должна схлопываться,
              // пока поля не заполнены, — иначе превью прыгает на первом же вводе.
              [72, 96, 58].map(w => (
                <div key={w} style={{
                  height: '9px', width: `${w}%`, borderRadius: '5px',
                  background: 'rgba(var(--ink),0.06)', marginBottom: '9px',
                }} />
              ))
            )}
          </div>

          {values.vat_id.trim() && (
            <div style={{
              marginTop: '12px', paddingTop: '12px', borderTop: '1px dashed var(--border, #F0EDE8)',
              fontSize: '11.5px', color: 'var(--muted, #666)',
              fontFamily: "'SF Mono', 'Consolas', monospace",
            }}>
              VAT {values.vat_id.trim()}
            </div>
          )}
        </div>
      </div>

      <div style={{ fontSize: '11.5px', color: 'var(--muted, #666)', lineHeight: 1.6 }}>
        {t('profile.preview.note')}
      </div>
    </div>
  );
}

interface Props {
  profile: BillingProfile | null;
  saving: boolean;
  /** Ушёл ли пользователь сюда с кнопки «Оплатить» — тогда кнопка ведёт к оплате. */
  beforePayment?: boolean;
  onClose: () => void;
  onSave: (body: BillingProfileInput) => void;
}

/**
 * Реквизиты плательщика. Показывается ОБЯЗАТЕЛЬНО перед первой оплатой: без
 * страны и адреса Stripe Tax не знает ставку, а фактура юрлица без адреса не
 * документ. Дальше не показывается никогда — данные лежат на аккаунте и
 * переезжают за человеком в любую его студию (GET /billing/profile).
 *
 * Закрыть можно: «обязательно» относится к оплате, а не к самой модалке —
 * запертое окно без выхода хуже несостоявшегося платежа.
 */
export default function BillingProfileModal({
  profile, saving, beforePayment, onClose, onSave,
}: Props) {
  const { t } = useTranslation('billing');
  const draft = useProfileDraft(profile);

  const submit = () => {
    if (saving || !draft.validate()) return;
    onSave(draft.payload());
  };

  return (
    <ModalShell size="lg" maxWidth="820px" leftWidth="300px" onClose={onClose} left={<InvoicePreview draft={draft} />}>
      <ModalHeader
        title={t(profile?.filled ? 'profile.editTitle' : 'profile.title')}
        subtitle={t(beforePayment ? 'profile.subtitlePay' : 'profile.subtitle')}
      />
      <ModalBody>
        <BillingProfileFields draft={draft} />
      </ModalBody>
      <ModalFooter>
        <GhostButton>{t('profile.cancel')}</GhostButton>
        <PrimaryButton onClick={submit} loading={saving}>
          {t(beforePayment ? 'profile.saveAndPay' : 'profile.save')}
        </PrimaryButton>
      </ModalFooter>
    </ModalShell>
  );
}
