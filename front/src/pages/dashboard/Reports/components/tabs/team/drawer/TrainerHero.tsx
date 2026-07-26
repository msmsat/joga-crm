import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { animate, useReducedMotion } from 'framer-motion';
import { GhostButton } from '../../../../../../../components/ui/index';
import { fmtInt, fmtMoney, fmtPct } from '../../../../../../../lib/format';
import type { TrainerRow } from '../../../../types';

export interface TrainerHeroProps {
  trainer: TrainerRow;
  onOpenProfile: () => void;
}

function initials(name: string): string {
  return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
}

// Счётчик от 0 до значения за 0.5s при открытии модалки — framer-motion animate()
// умеет тянуть числа напрямую, без ручного requestAnimationFrame.
function useCountUp(target: number, reduceMotion: boolean): number {
  const [value, setValue] = useState(reduceMotion ? target : 0);
  useEffect(() => {
    if (reduceMotion) return;
    const controls = animate(0, target, { duration: 0.5, ease: 'easeOut', onUpdate: setValue });
    return () => controls.stop();
  }, [target, reduceMotion]);
  return value;
}

function StarIcon({ filled }: { filled: boolean }) {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill={filled ? '#f0c040' : 'none'} stroke="#f0c040" strokeWidth="1.5">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ padding: '12px', borderRadius: '12px', background: 'rgba(26,26,26,0.025)' }}>
      <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.3px' }}>
        {label}
      </div>
      <div style={{ fontSize: '17px', fontWeight: 800, color: 'var(--text)', marginTop: '4px' }}>{value}</div>
    </div>
  );
}

export function TrainerHero({ trainer, onOpenProfile }: TrainerHeroProps) {
  const { t } = useTranslation('reports');
  const reduceMotion = !!useReducedMotion();
  const lessons = useCountUp(trainer.lessons, reduceMotion);
  const revenue = useCountUp(trainer.revenue, reduceMotion);
  const returnRate = useCountUp(trainer.return_rate_pct, reduceMotion);
  const fillPct = useCountUp(trainer.fill_pct, reduceMotion);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{
        width: '64px', height: '64px', borderRadius: '50%', flexShrink: 0,
        background: 'rgba(249,160,139,0.14)', color: '#C07060',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '22px', fontWeight: 800,
        boxShadow: '0 0 0 3px rgba(249,160,139,0.18)',
      }}>
        {initials(trainer.name)}
      </div>

      <div style={{ fontSize: '18px', fontWeight: 900, color: 'var(--text)', letterSpacing: '-0.3px', marginTop: '16px' }}>
        {trainer.name}
      </div>

      {trainer.rating != null && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '3px', marginTop: '6px' }}>
          {[1, 2, 3, 4, 5].map(i => <StarIcon key={i} filled={i <= Math.round(trainer.rating!)} />)}
          <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text2)', marginLeft: '4px' }}>
            {trainer.rating.toFixed(1)}
          </span>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '24px' }}>
        <MetricCard label={t('team.table.lessons')} value={fmtInt(lessons)} />
        <MetricCard label={t('team.table.revenue')} value={fmtMoney(revenue)} />
        <MetricCard label={t('team.table.returnRate')} value={fmtPct(returnRate)} />
        <MetricCard label={t('team.table.fillPct')} value={`${Math.round(fillPct)}%`} />
      </div>

      <div style={{ flex: 1 }} />
      <GhostButton onClick={onOpenProfile}>{t('team.drawer.openProfile')}</GhostButton>
    </div>
  );
}
