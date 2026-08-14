import { useTranslation } from 'react-i18next';
import { TRIAL_DAYS } from '../api/billing/billing.types';
import { useActivateTrial } from '../hooks/useActivateTrial';
// Путь с /index — иначе на Windows импорт папки ui сталкивается с UI.tsx по регистру.
import {
  ModalShell, ModalHeader, ModalBody, ModalFooter, GhostButton, PrimaryButton,
} from './ui/index';

/**
 * Предложение пробного периода только что созданной студии.
 *
 * Показывается, пока у студии нет строки подписки (GET /billing/plan →
 * status=none): создание студии триал больше не начисляет, его включает
 * владелец сам. Поэтому обе кнопки настоящие — «Активировать» заводит
 * 14 дней, «Отказаться» не заводит ничего, и студия упирается в пейволл,
 * который приведёт её на «Тариф и оплата». Предложение при этом не сгорает:
 * там же лежит плашка с той же кнопкой (TrialOfferCard).
 *
 * closeOnBackdrop={false} — промах мимо окна не должен читаться как отказ;
 * Esc и крестик оставлены, они равны «Отказаться».
 */
export default function TrialOfferModal({ onDecline }: { onDecline: () => void }) {
  const { t } = useTranslation('billing');
  const activate = useActivateTrial();

  return (
    <ModalShell onClose={onDecline} closeOnBackdrop={false}>
      <ModalHeader title={t('trial.title', { days: TRIAL_DAYS })} subtitle={t('trial.subtitle')} />

      <ModalBody>
        <div style={{
          display: 'flex', alignItems: 'center', gap: '14px',
          padding: '16px 18px', borderRadius: '14px',
          background: 'rgba(249,160,139,0.10)', border: '1px solid rgba(249,160,139,0.28)',
        }}>
          <div style={{
            width: '48px', height: '48px', borderRadius: '14px', flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'linear-gradient(135deg, #FCAE91, #F9A08B)',
          }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M12 3l1.912 5.813a2 2 0 001.275 1.275L21 12l-5.813 1.912a2 2 0 00-1.275 1.275L12 21l-1.912-5.813a2 2 0 00-1.275-1.275L3 12l5.813-1.912a2 2 0 001.275-1.275L12 3z" />
            </svg>
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: '20px', fontWeight: 900, color: 'var(--onyx)', letterSpacing: '-0.4px' }}>
              {t('trial.headline', { days: TRIAL_DAYS })}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '2px' }}>
              {t('trial.noCard')}
            </div>
          </div>
        </div>

        <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {['allModules', 'noCommitment', 'keepData'].map((key) => (
            <li key={key} style={{ display: 'flex', gap: '10px', fontSize: '13px', lineHeight: 1.55, color: 'var(--text2)' }}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ marginTop: '2px', flexShrink: 0 }} aria-hidden>
                <circle cx="8" cy="8" r="7.5" fill="#F9A08B" />
                <path d="m5 8.2 2.2 2.2L11 6.4" stroke="#FFFFFF" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span>{t(`trial.perks.${key}`)}</span>
            </li>
          ))}
        </ul>
      </ModalBody>

      <ModalFooter>
        <GhostButton onClick={onDecline}>{t('trial.decline')}</GhostButton>
        <PrimaryButton onClick={() => activate.mutate()} loading={activate.isPending}>
          {t('trial.activate')}
        </PrimaryButton>
      </ModalFooter>
    </ModalShell>
  );
}
