import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { BillingProfile, BillingProfileInput } from '../../../../../api/billing/billing.types';
import { Button } from '../../../../../components/ui/index';
import { BillingProfileFields } from '../modals/BillingProfileModal';
import { useCountryName, useProfileDraft } from '../../hooks/useProfileDraft';

const CARD_STYLE: React.CSSProperties = {
  padding: '24px 28px', background: 'var(--bg-card)', border: '1px solid var(--border)',
  borderRadius: '20px', boxShadow: 'var(--shadow)',
};

function CardHead({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div style={{ marginBottom: '18px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
        <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="var(--peach)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 2h7l3 3v13H5z" /><path d="M8 8h4M8 11h4M8 14h2" />
        </svg>
        <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--onyx)' }}>{title}</span>
      </div>
      <div style={{ fontSize: '12px', color: 'var(--muted)', lineHeight: 1.6 }}>{subtitle}</div>
    </div>
  );
}

/** Строка «подпись → значение» в режиме просмотра. */
function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: 0 }}>
      <span style={{
        fontSize: '10.5px', fontWeight: 800, letterSpacing: '0.7px',
        textTransform: 'uppercase', color: 'var(--text3, #AAA)',
      }}>
        {label}
      </span>
      <span style={{
        fontSize: '13.5px', fontWeight: 600, color: 'var(--onyx)', wordBreak: 'break-word',
        fontFamily: mono ? "'SF Mono', 'Consolas', monospace" : undefined,
      }}>
        {value}
      </span>
    </div>
  );
}

function Editor({ profile, saving, onSave, onCancel }: {
  profile: BillingProfile | null;
  saving: boolean;
  onSave: (body: BillingProfileInput) => Promise<unknown>;
  onCancel: () => void;
}) {
  const { t } = useTranslation('billing');
  const draft = useProfileDraft(profile);

  const submit = () => {
    if (saving || !draft.validate()) return;
    onSave(draft.payload()).then(onCancel).catch(() => { /* тост показал хук */ });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Та же сетка полей, что и в модалке перед оплатой: правила обязательности
          и валидация живут в одном месте (useProfileDraft). */}
      <div style={{ maxWidth: '560px' }}>
        <BillingProfileFields draft={draft} />
      </div>
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
        <Button variant="primary" loading={saving} onClick={submit}>{t('profile.save')}</Button>
        <Button variant="ghost" onClick={onCancel}>{t('profile.cancel')}</Button>
      </div>
    </div>
  );
}

interface Props {
  profile: BillingProfile | null;
  saving: boolean;
  save: (body: BillingProfileInput) => Promise<unknown>;
}

/**
 * Реквизиты плательщика во вкладке «Способ оплаты»: заполненные — просто показаны,
 * с кнопкой «Редактировать» под ними; по кнопке карточка превращается в ту же
 * форму, что показывается перед первой оплатой.
 *
 * Данные принадлежат АККАУНТУ, а не студии, — правка здесь меняет их во всех
 * студиях владельца сразу (PUT /billing/profile).
 */
export default function BillingProfileCard({ profile, saving, save }: Props) {
  const { t } = useTranslation('billing');
  const [editing, setEditing] = useState(false);
  const countryName = useCountryName(profile?.country);

  const address = [
    profile?.line1,
    profile?.line2,
    [profile?.postal_code, profile?.city].filter(Boolean).join(' '),
  ].filter(Boolean).join(', ');

  return (
    <div style={{ marginTop: '12px', ...CARD_STYLE }}>
      <CardHead
        title={t('profile.cardTitle')}
        subtitle={t(profile?.filled ? 'profile.cardSubtitle' : 'profile.cardEmpty')}
      />

      {editing ? (
        // key — чтобы черновик пересобирался от текущего профиля при каждом входе
        // в правку, а не хранил значения прошлой отменённой попытки.
        <Editor
          key={JSON.stringify(profile)}
          profile={profile}
          saving={saving}
          onSave={save}
          onCancel={() => setEditing(false)}
        />
      ) : profile?.filled ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(180px, 100%), 1fr))',
            gap: '18px 24px', padding: '18px 20px',
            background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '14px',
          }}>
            <Row label={t('profile.fields.country')} value={countryName} />
            <Row label={t('profile.fields.address')} value={address} />
            <Row
              label={t('profile.fields.vat')}
              value={profile.vat_id || t('profile.vatNone')}
              mono={!!profile.vat_id}
            />
          </div>
          <div>
            <Button variant="ghost" onClick={() => setEditing(true)}>{t('profile.edit')}</Button>
          </div>
        </div>
      ) : (
        <Button variant="primary" onClick={() => setEditing(true)}>{t('profile.add')}</Button>
      )}
    </div>
  );
}
