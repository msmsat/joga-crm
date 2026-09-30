// Плитки окна оплаты (PaySheet): баллы и депозит с выключателем, приглашения,
// своя скидка администратора, строки чека.
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Switch } from '../../../../../components/ui/index';
import type { ReferralSummary } from '../../../../../api/schedule/schedule.types';
import type { PaymentCheck } from '../../hooks/usePaymentCheck';

const QUICK_PERCENTS = [5, 10, 15, 20];

export function BalanceTile({ title, value, switchLabel, checked, disabled, onChange }: {
  title: string; value: string; switchLabel: string; checked: boolean; disabled: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className={`rp-tile${checked ? ' is-on' : ''}`}>
      <div className="rp-tile-head">
        <span className="rp-tile-title">{title}</span>
        <span className="rp-tile-value">{value}</span>
      </div>
      <label className="rp-switch">
        <Switch checked={checked} onChange={onChange} disabled={disabled} />
        <span>{switchLabel}</span>
      </label>
    </div>
  );
}

/** Приглашения клиента: кто привёл, ждёт ли скидка новичка (её снимет сам
 *  расчёт — строкой «Скидка по приглашению» в чеке), скольких привёл он сам и
 *  что студия дарит за друга — повод сказать об этом у стойки. */
export function ReferralTile({ referral, money }: { referral: ReferralSummary; money: (value: number) => string }) {
  const { t } = useTranslation('journal');
  const bonus = referral.invite_bonus == null ? null
    : referral.invite_bonus_type === 'points'
      ? t('lessonPay.inviteBonus.points', { value: referral.invite_bonus })
      : t(`lessonPay.inviteBonus.${referral.invite_bonus_type === 'deposit' ? 'deposit' : 'discount'}`,
          { amount: money(referral.invite_bonus) });
  return (
    <div className="rp-tile rp-referral">
      <div className="rp-tile-head">
        <span className="rp-tile-title">{t('lessonPay.referral')}</span>
        <span className="rp-tile-value">{t('lessonPay.invitedCount', { count: referral.invited_count })}</span>
      </div>
      {referral.invited_by && <div className="rp-note">{t('lessonPay.invitedBy', { name: referral.invited_by })}</div>}
      {referral.discount_percent != null && (
        <div className="rp-note rp-note-gain">{t('lessonPay.referralDiscount', { percent: referral.discount_percent })}</div>
      )}
      {bonus && <div className="rp-note">{bonus}</div>}
    </div>
  );
}

export function ManualDiscount({ payment, disabled }: { payment: PaymentCheck; disabled: boolean }) {
  const { t } = useTranslation('journal');
  const [inputMode, setInputMode] = useState<'custom' | 'preset'>('custom');
  return (
    <div className="rp-manual">
      <div className="rp-tile-title">{t('lessonPay.manual')}</div>
      <div className="rp-chips">
        {QUICK_PERCENTS.map(p => (
          <button key={p} type="button" disabled={disabled}
                  className={`rp-chip${inputMode === 'preset' && payment.manualPercent === p ? ' is-on' : ''}`}
                  aria-pressed={inputMode === 'preset' && payment.manualPercent === p}
                  onClick={() => {
                    payment.setManual(inputMode === 'preset' && payment.manualPercent === p ? '' : String(p));
                    setInputMode('preset');
                  }}>
            −{p}%
          </button>
        ))}
        <label className={`rp-chip rp-chip-input${payment.manualInvalid ? ' is-error' : ''}`}>
          <input
            inputMode="numeric"
            value={inputMode === 'preset' ? '' : payment.manual}
            onChange={e => {
              setInputMode('custom');
              payment.setManual(e.target.value);
            }}
            placeholder={t('lessonPay.manualPlaceholder')}
            aria-label={t('lessonPay.manual')}
            disabled={disabled}
          />
          <span>%</span>
        </label>
      </div>
      {payment.manualInvalid && <div className="rp-note rp-note-error">{t('payment.manualInvalid')}</div>}
    </div>
  );
}

export function Line({ label, value, tone }: { label: string; value: string; tone?: 'gain' }) {
  return (
    <div className="rp-line">
      <span>{label}</span>
      <span className={tone === 'gain' ? 'rp-gain' : undefined}>{value}</span>
    </div>
  );
}

export function FailedNote({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation(['journal', 'common']);
  return (
    <div className="rp-note rp-note-error" role="alert">
      {t('journal:payment.loadFailed')}{' '}
      <button type="button" className="rp-link" onClick={onRetry}>{t('common:errors.retry')}</button>
    </div>
  );
}
