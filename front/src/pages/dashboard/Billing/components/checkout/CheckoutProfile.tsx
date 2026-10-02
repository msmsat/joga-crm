import { type RefObject } from 'react';
import { Check, MapPin, Pencil } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useCountryName, useCountryOptions, useProfileDraft, vatErrorOf, vatPrefix } from '../../hooks/useProfileDraft';
import type { BillingProfile, BillingProfileInput } from '../../../../../api/billing/billing.types';
import CheckoutCountry from './CheckoutCountry';
import styles from './CheckoutPage.module.css';

export default function CheckoutProfile({ profile, locked, busy, onSave, onEdit, formRef, onDirty }: {
  profile: BillingProfile | undefined; locked: boolean; busy: boolean;
  onSave: (input: BillingProfileInput) => Promise<void>; onEdit: () => void;
  formRef: RefObject<HTMLFormElement | null>; onDirty: () => void;
}) {
  const { t } = useTranslation('billing');
  const draft = useProfileDraft(profile ?? null);
  const countries = useCountryOptions();
  const country = useCountryName(profile?.country);
  const vatPending = !!profile?.vat_id && profile.vat_verified === false;
  const textField = (field: 'legal_name' | 'registration_id' | 'line1' | 'postal_code' | 'city' | 'vat_id', autoComplete: string) => {
    const error = field === 'vat_id' ? draft.vatError : draft.showErrors && draft.errors[field];
    const key = field === 'legal_name' ? 'legalName' : field === 'registration_id'
      ? draft.values.country === 'CZ' ? 'registrationIdCz' : 'registrationId'
      : field === 'line1' ? 'address' : field === 'vat_id' ? 'vat' : field === 'postal_code' ? 'postalCode' : field;
    return <label className={styles.field}>
      <span>{t(`profile.fields.${key}`)}</span>
      <input name={field} value={draft.values[field]} onChange={e => { draft.set(field)(field === 'vat_id' ? e.target.value.toUpperCase() : e.target.value); onDirty(); }}
        autoComplete={autoComplete} disabled={busy} maxLength={field === 'vat_id' ? 30 : field === 'registration_id' ? 40 : field === 'postal_code' ? 20 : field === 'city' ? 100 : 200}
        placeholder={field === 'legal_name' ? t('profile.fields.legalNamePlaceholder')
          : field === 'registration_id' ? t('profile.fields.registrationIdPlaceholder')
          : field === 'line1' ? t('profile.fields.line1Placeholder')
          : field === 'vat_id' ? t('profile.fields.vatPlaceholder', { prefix: vatPrefix(draft.values.country) }) : undefined}
        aria-describedby={field === 'vat_id' ? 'checkout-vat-hint' : undefined}
        aria-invalid={!!error} required={field !== 'vat_id' && field !== 'registration_id'} />
      {error && <small className={styles.fieldError} role="alert">{error}</small>}
    </label>;
  };
  if (locked) return <>
    <div className={styles.profileSummary}>
      <span className={styles.addressIcon}><MapPin size={18} /></span>
      <div><strong>{profile?.legal_name}</strong><span>{country}, {profile?.line1}, {profile?.postal_code} {profile?.city}</span>
        {profile?.registration_id && <span>{t('profile.registrationNumber', { number: profile.registration_id })}</span>}
        {profile?.vat_id && <span>{t('checkout.vatNumber', { number: profile.vat_id })}</span>}</div>
      <button type="button" className={styles.editButton} onClick={onEdit} disabled={busy} aria-label={t('checkout.edit')}>
        <Pencil size={15} /><span>{t('checkout.edit')}</span></button>
    </div>
    {vatPending && <p className={styles.hint} role="status">{t('checkout.vatPending')}</p>}
  </>;
  return <form ref={formRef} className={styles.profileForm} onSubmit={e => {
    e.preventDefault(); if (!busy && draft.validate()) void onSave(draft.payload()).catch(err => draft.setVatError(vatErrorOf(err, t)));
  }}>
    <div className={styles.fieldGrid}>
      <div className={styles.payerIdentity}>
        {textField('legal_name', 'billing organization')}
        <div className={styles.field}>
          <span>{t('profile.fields.country')}</span>
          <CheckoutCountry value={draft.values.country} options={countries} onChange={value => { draft.set('country')(value); onDirty(); }}
            disabled={busy} invalid={draft.showErrors && !!draft.errors.country} />
          {draft.showErrors && draft.errors.country && <small className={styles.fieldError}>{draft.errors.country}</small>}
        </div>
      </div>
      <div className={styles.wideField}>{textField('line1', 'address-line1')}</div>
      {textField('postal_code', 'postal-code')}{textField('city', 'address-level2')}
      <div className={styles.registrationFields} data-single={!draft.vatAsked || undefined}>
        {textField('registration_id', 'off')}
        {draft.vatAsked && textField('vat_id', 'off')}
      </div>
      {draft.vatAsked && <p id="checkout-vat-hint" className={`${styles.profileHint} ${styles.wideField}`}>
        {t(vatPending ? 'checkout.vatPending' : 'checkout.vatIdHint')}</p>}
    </div>
    <p className={styles.profileHint}><Check size={13} />{t('checkout.savedForNextTime')}</p>
  </form>;
}
