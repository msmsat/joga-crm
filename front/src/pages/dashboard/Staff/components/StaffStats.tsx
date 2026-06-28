import { useTranslation } from 'react-i18next';
import type { Employee } from '../types';

export interface StaffStatsProps {
  staff: Employee[];
}

interface StatItemProps {
  value: number;
  label: string;
  color?: string;
}

function StatItem({ value, label, color }: StatItemProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '10px 24px', gap: '2px' }}>
      <span style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.5px', color: color ?? 'var(--text)' }}>
        {value}
      </span>
      <span style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.4px', whiteSpace: 'nowrap' }}>
        {label}
      </span>
    </div>
  );
}

function Divider() {
  return <div style={{ width: '1px', height: '32px', background: 'var(--border)', flexShrink: 0 }} />;
}

const TRAINER_ROLE_IDS = new Set([
  'master_trainer','reformer_trainer','mat_trainer','stretching',
  'mfr','healthy_back','yoga','rehab','masseur','osteopath','trainer',
]);
const ADMIN_ROLE_IDS = new Set(['admin','manager']);

export function StaffStats({ staff }: StaffStatsProps) {
  const { t } = useTranslation('staff');
  const total    = staff.length;
  const online   = staff.filter(s => s.is_online).length;
  const trainers = staff.filter(s => TRAINER_ROLE_IDS.has(s.role)).length;
  const admins   = staff.filter(s => ADMIN_ROLE_IDS.has(s.role)).length;

  return (
    <div style={{
      display: 'flex', alignItems: 'center',
      background: 'var(--card)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius-lg)', boxShadow: 'var(--dash-shadow)',
      overflow: 'hidden', flexShrink: 0,
    }}>
      <StatItem value={total}    label={t('stats.totalInTeam')} />
      <Divider />
      <StatItem value={online}   label={t('stats.onShift')} color="#5BAB72" />
      <Divider />
      <StatItem value={trainers} label={t('stats.trainers')} />
      <Divider />
      <StatItem value={admins}   label={t('stats.administrators')} />

      <div style={{ marginLeft: 'auto', padding: '0 20px' }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: '7px',
          padding: '7px 14px', borderRadius: '10px',
          background: 'rgba(91,171,114,0.1)', border: '1px solid rgba(91,171,114,0.2)',
        }}>
          <div style={{
            width: '7px', height: '7px', borderRadius: '50%',
            background: '#5BAB72', boxShadow: '0 0 6px rgba(91,171,114,0.6)',
            animation: 'pulse 2s ease-in-out infinite',
          }} />
          <span style={{ fontSize: '11px', fontWeight: 700, color: '#4a8a52' }}>
            {t('stats.onlineNow', { count: online })}
          </span>
        </div>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.5; }
        }
      `}</style>
    </div>
  );
}
