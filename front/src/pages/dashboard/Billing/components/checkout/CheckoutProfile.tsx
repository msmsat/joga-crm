import { useState, type RefObject } from 'react';
import { Check, MapPin, Pencil } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useCountryName, useCountryOptions, useProfileDraft } from '../../hooks/useProfileDraft';
import type { BillingProfile, BillingProfileInput } from '../../../../../api/billing/billing.types';
import CheckoutCountry from './CheckoutCountry';
import styles from './CheckoutPage.module.css';

export default function CheckoutProfile({ profile, locked, busy, onSave, onEdit, formRef }: {
  profile: BillingProfile | undefined; locked: boolean; busy: boolean;
  onSave: (input: BillingProfileInput) => Promise<void>; onEdit: () => void;
  formRef: RefObject<HTMLFormElement | null>;
}) {
  const { t } = useTranslation('billing');
  const draft = useProfileDraft(profile ?? null);
  const countries = useCountryOptions();
  const country = useCountryName(profile?.country);
  const [vatVisible, setVatVisible] = useState(!!profile?.vat_id);
  const textField = (field: 'line1' | 'postal_code' | 'city' | 'vat_id', autoComplete: string) => (
    <label className={styles.field}>
      <span>{t(field === 'line1' ? 'profile.fields.address' : `profile.fields.${field === 'vat_id' ? 'vat' : field === 'postal_code' ? 'postalCode' : field}`)}</span>
      <input value={draft.values[field]} onChange={e => draft.set(field)(e.target.value)}
        autoComplete={autoComplete} disabled={busy} maxLength={field === 'vat_id' ? 30 : 200}
        placeholder={field === 'line1' ? t('profile.fields.line1Placeholder') : undefined}
        aria-invalid={draft.showErrors && !!draft.errors[field]} required={field !== 'vat_id'} />
      {draft.showErrors && draft.errors[field] && <small className={styles.fieldError}>{draft.errors[field]}</small>}
    </label>
  );
  if (locked) return <div className={styles.profileSummary}>
    <span className={styles.addressIcon}><MapPin size={18} /></span>
    <div><strong>{country}</strong><span>{profile?.line1}, {profile?.postal_code} {profile?.city}</span>
      {profile?.vat_id && <span>{profile.vat_id}</span>}</div>
    <button type="button" className={styles.editButton} onClick={onEdit} disabled={busy} aria-label={t('checkout.edit')}>
      <Pencil size={15} /><span>{t('checkout.edit')}</span></button>
  </div>;
  return <form ref={formRef} className={styles.profileForm} onSubmit={e => {
    e.preventDefault(); if (draft.validate()) void onSave(draft.payload());
  }}>
    <div className={styles.fieldGrid}>
      <div className={`${styles.field} ${styles.wideField}`}>
        <span>{t('profile.fields.country')}</span>
        <CheckoutCountry value={draft.values.country} options={countries} onChange={draft.set('country')}
          disabled={busy} invalid={draft.showErrors && !!draft.errors.country} />
        {draft.showErrors && draft.errors.country && <small className={styles.fieldError}>{draft.errors.country}</small>}
      </div>
      <div className={styles.wideField}>{textField('line1', 'address-line1')}</div>
      {textField('postal_code', 'postal-code')}{textField('city', 'address-level2')}
      {draft.vatAsked && <div className={styles.wideField}>
        <label className={styles.vatToggle}><input type="checkbox" checked={vatVisible} disabled={busy}
          onChange={e => { setVatVisible(e.target.checked); if (!e.target.checked) draft.set('vat_id')(''); }} />
          <span>{t('checkout.addVat')}</span></label>
        {vatVisible && <div className={styles.vatField}>{textField('vat_id', 'off')}</div>}
      </div>}
    </div>
    <p className={styles.profileHint}><Check size={13} />{t('checkout.savedForNextTime')}</p>
  </form>;
}
