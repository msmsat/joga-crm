import { useTranslation } from 'react-i18next';
import styles from '../../Loyalty.module.css';
import type { ConfigProgramKey, Program, ProgramKey } from '../../types';
import { IconSettings, IconLock } from '../ui/LoyaltyIcons';

interface Props {
  programsList: Program[];
  openDrawer: (key: ProgramKey, title: string) => void;
  toggleProgram: (key: ConfigProgramKey, enabled: boolean) => void;
}

export default function ProgramsGrid({ programsList, openDrawer, toggleProgram }: Props) {
  const { t } = useTranslation('loyalty');
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px', marginBottom: '24px' }}>
      {programsList.map((prog, i) => {
        const configKey = prog.key === 'promocodes' || prog.key === 'deposit' ? null : prog.key;
        return (
        <div
          key={prog.key}
          className={`${styles.programCard} ${prog.configured ? styles.programCardConfigured : ''}`}
          style={{
            animationDelay: `${i * 0.05}s`,
            borderColor: prog.configured ? prog.accentBorder : 'var(--border)',
            background: prog.configured ? prog.accentBg : 'var(--card)',
            display: 'flex',
            flexDirection: 'column',
          }}
          onClick={() => openDrawer(prog.key, prog.title)}
        >
          <div style={{
            width: '40px', height: '40px', borderRadius: '10px',
            background: prog.configured ? `${prog.accentColor}20` : 'var(--border)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: prog.configured ? prog.accentColor : 'var(--text3)',
            marginBottom: '14px', transition: 'background 0.2s',
          }}>
            {prog.icon}
          </div>

          <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '4px' }}>{prog.title}</div>
          <div style={{ fontSize: '11px', color: 'var(--text2)', marginBottom: '16px', lineHeight: 1.4, flex: 1 }}>{prog.desc}</div>

          {prog.configured ? (
            <div style={{ marginTop: 'auto' }}>
              {prog.stats && (
                <>
                  <div style={{ fontSize: '22px', fontWeight: 800, color: prog.accentColor, marginBottom: '2px' }}>
                    {prog.stats.value}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text3)' }}>{prog.stats.label}</div>
                </>
              )}
              <div style={{ marginTop: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span className={styles.badgeConfigured}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  {t('card.active')}
                </span>
                {configKey && (
                  <button
                    onClick={e => { e.stopPropagation(); toggleProgram(configKey, false); }}
                    style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--text3)', fontSize: '11px', fontWeight: 600, textDecoration: 'underline' }}
                  >
                    {t('card.disable')}
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div style={{ marginTop: 'auto' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text3)', marginBottom: '12px' }}>
                <IconLock />
                <span style={{ fontSize: '12px', fontWeight: 600 }}>{t('card.notConfigured')}</span>
              </div>
              <button
                className={styles.configureBtn}
                style={{ background: 'var(--border)', color: 'var(--text2)', width: '100%', justifyContent: 'center' }}
                onClick={e => { e.stopPropagation(); openDrawer(prog.key, prog.title); }}
              >
                <IconSettings />
                {t('card.configure')}
              </button>
            </div>
          )}
        </div>
        );
      })}
    </div>
  );
}
