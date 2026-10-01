import { useTranslation } from 'react-i18next';
import { useCountryName, useCountryOptions, useProfileDraft } from '../../hooks/useProfileDraft';
import type { BillingProfile, BillingProfileInput } from '../../../../../api/billing/billing.types';
import styles from './CheckoutPage.module.css';

export default function CheckoutProfile({ profile, locked, busy, onSave, onEdit }: {
  profile: BillingProfile | undefined;
  locked: boolean;
  busy: boolean;
  onSave: (input: BillingProfileInput) => Promise<void>;
  onEdit: () => void;
}) {
  const { t } = useTranslation('billing');
  const draft = useProfileDraft(profile ?? null);
  const countries = useCountryOptions();
  const country = useCountryName(profile?.country);
  const textField = (field: 'line1' | 'line2' | 'postal_code' | 'city' | 'vat_id', autoComplete: string) => (
    <label className={styles.field}>
      <span>{t(`profile.fields.${field === 'vat_id' ? 'vat' : field}`)}</span>
      <input value={draft.values[field]} onChange={e => draft.set(field)(e.target.value)}
        autoComplete={autoComplete} disabled={busy} maxLength={field === 'vat_id' ? 30 : 200}
        aria-invalid={draft.showErrors && !!draft.errors[field]}
        required={field !== 'line2' && field !== 'vat_id'} />
      {draft.showErrors && draft.errors[field] && <small className={styles.error}>{draft.errors[field]}</small>}
    </label>
  );
  if (locked) return (
    <div className={styles.profileSummary}>
      <div><strong>{country}</strong><span>{profile?.line1}, {profile?.postal_code} {profile?.city}</span>
        {profile?.vat_id && <span>{profile.vat_id}</span>}</div>
      <button type="button" className={styles.textButton} onClick={onEdit} disabled={busy}>{t('checkout.edit')}</button>
    </div>
  );
  return (
    <form className={styles.profileForm} onSubmit={e => {
      e.preventDefault(); if (draft.validate()) void onSave(draft.payload());
    }}>
      <div className={styles.fieldGrid}>
        <label className={styles.field}>
          <span>{t('profile.fields.country')}</span>
          <select value={draft.values.country} onChange={e => draft.set('country')(e.target.value)} required disabled={busy} autoComplete="country">
            <option value="">{t('profile.fields.countryPlaceholder')}</option>
            {countries.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </label>
        {draft.vatAsked && textField('vat_id', 'off')}
        <div className={styles.wideField}>{textField('line1', 'address-line1')}</div>
        {textField('postal_code', 'postal-code')}
        {textField('city', 'address-level2')}
      </div>
      <p className={styles.hint}>{t('checkout.profileHint')}</p>
      <button className={styles.prepareButton} type="submit" disabled={busy} aria-busy={busy}>
        {t(busy ? 'checkout.preparing' : 'checkout.continue')}
      </button>
    </form>
  );
}
