import styles from '../../Loyalty.module.css';
import { IconArrow } from '../ui/LoyaltyIcons';
import type { ProgramKey } from '../../types';

interface Props {
  configuredCount: number;
  total: number;
  openDrawer: (key: ProgramKey, title: string) => void;
}

export default function ProgressHeader({ configuredCount, total, openDrawer }: Props) {
  if (configuredCount === total) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: '16px',
        background: 'rgba(91,171,114,0.06)', border: '1px solid rgba(91,171,114,0.25)',
        borderRadius: 'var(--radius)', padding: '16px 24px', marginBottom: '24px',
        animation: 'fadeSlideIn 0.3s ease',
      }}>
        <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'rgba(91,171,114,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#5BAB72' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <div>
          <div style={{ fontSize: '13px', fontWeight: 700 }}>Все программы настроены</div>
          <div style={{ fontSize: '12px', color: 'var(--text2)' }}>Система лояльности работает в полную силу</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '16px',
      background: 'rgba(252,174,145,0.06)', border: '1px solid rgba(252,174,145,0.2)',
      borderRadius: 'var(--radius)', padding: '16px 24px', marginBottom: '24px',
      animation: 'fadeSlideIn 0.3s ease',
    }}>
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <svg width="40" height="40" viewBox="0 0 40 40">
          <circle cx="20" cy="20" r="16" fill="none" stroke="var(--border)" strokeWidth="3" />
          <circle cx="20" cy="20" r="16" fill="none" stroke="#FCAE91" strokeWidth="3"
            strokeDasharray={`${(configuredCount / total) * 100.5} 100.5`}
            strokeDashoffset="25" strokeLinecap="round"
            style={{ transition: 'stroke-dasharray 0.5s ease' }}
          />
          <text x="20" y="24" textAnchor="middle" fontSize="11" fontWeight="700" fill="#FCAE91">{configuredCount}/{total}</text>
        </svg>
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '2px' }}>Настройте программы лояльности</div>
        <div style={{ fontSize: '12px', color: 'var(--text2)' }}>Настроено {configuredCount} из {total} программ · Каждая программа увеличивает удержание клиентов</div>
      </div>
      {configuredCount === 0 && (
        <button
          className={styles.configureBtn}
          style={{ background: '#FCAE91', color: 'white' }}
          onClick={() => openDrawer('loyalty', 'Карты лояльности')}
        >
          Начать <IconArrow />
        </button>
      )}
    </div>
  );
}
