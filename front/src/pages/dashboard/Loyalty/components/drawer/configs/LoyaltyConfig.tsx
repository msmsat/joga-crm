import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import styles from '../../../Loyalty.module.css';
import type { LoyaltyConfig as LoyaltyConfigType, LoyaltyLevel } from '../../../../../../api/loyalty/loyalty.types';
import { useStudioCurrency } from '../../../../../../hooks/useStudioCurrency';
import { getCurrencySymbol } from '../../../../../../components/UI';
import { ConfirmModal, InfoHint } from '../../../../../../components/ui/index';
import type { ConfigErrors } from '../../../hooks/validateConfig';

interface Props {
  value: LoyaltyConfigType | null;
  onChange: (patch: Partial<LoyaltyConfigType>) => void;
  errors?: ConfigErrors;
  levels: LoyaltyLevel[] | null;
  onUpdateLevel: (id: number, patch: Partial<Pick<LoyaltyLevel, 'name' | 'color' | 'min_threshold' | 'point_value'>>) => void;
  onAddLevel: () => void;
  onRemoveLevel: (id: number) => void;
}

const EXPIRY_KEYS = ['3m', '6m', '1y', 'never'] as const;

export default function LoyaltyConfig({ value, onChange, errors = {}, levels, onUpdateLevel, onAddLevel, onRemoveLevel }: Props) {
  const { t } = useTranslation('loyalty');
  const currency = getCurrencySymbol(useStudioCurrency());
  const programName = value?.program_name ?? 'Velora Club';
  const rate = value?.points_exchange_rate ?? 100;
  const expiry = value?.expiry_period ?? 'never';
  const [deleteTarget, setDeleteTarget] = useState<LoyaltyLevel | null>(null);
  const sortedLevels = [...(levels ?? [])].sort((a, b) => a.sort_order - b.sort_order);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
      <div>
        <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '16px' }}>{t('config.mainParams')}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div>
            <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text2)', display: 'block', marginBottom: '6px' }}>{t('config.programName')}</label>
            <input value={programName} onChange={e => onChange({ program_name: e.target.value })} style={{ width: '100%', padding: '10px 14px', borderRadius: 'var(--radius-sm)', border: `1px solid ${errors.program_name ? '#D88C9A' : 'var(--border)'}`, background: 'var(--bg)', color: 'var(--text)', fontSize: '14px', boxSizing: 'border-box' }} />
            {errors.program_name && <div style={{ fontSize: '11.5px', color: '#D88C9A', fontWeight: 600, marginTop: '6px' }}>{errors.program_name}</div>}
          </div>
          <div>
            <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text2)', display: 'block', marginBottom: '6px' }}>{t('config.pointsRate', { currency })}</label>
            <input type="number" value={rate} onChange={e => onChange({ points_exchange_rate: Number(e.target.value) })} style={{ width: '100%', padding: '10px 14px', borderRadius: 'var(--radius-sm)', border: `1px solid ${errors.points_exchange_rate ? '#D88C9A' : 'var(--border)'}`, background: 'var(--bg)', color: 'var(--text)', fontSize: '14px', boxSizing: 'border-box' }} />
            {errors.points_exchange_rate && <div style={{ fontSize: '11.5px', color: '#D88C9A', fontWeight: 600, marginTop: '6px' }}>{errors.points_exchange_rate}</div>}
          </div>
        </div>
      </div>

      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '16px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{t('config.levels')}</div>
          <InfoHint title={t('config.levels')} text={t('config.pointValueHint')} />
        </div>
        {sortedLevels.map((lvl, i) => (
          <div key={lvl.id} className={styles.levelCard} style={{ boxShadow: `inset 0 0 0 1px ${lvl.color}33` }}>
            <div className={styles.levelHead}>
              <label className={styles.levelSwatch} style={{ background: lvl.color }}>
                <input type="color" value={lvl.color} onChange={e => onUpdateLevel(lvl.id, { color: e.target.value })} />
              </label>
              <input
                className={styles.levelName}
                value={lvl.name}
                onChange={e => onUpdateLevel(lvl.id, { name: e.target.value })}
              />
              <button
                className={styles.levelDel}
                onClick={() => setDeleteTarget(lvl)}
                disabled={sortedLevels.length <= 1}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6" /></svg>
              </button>
            </div>

            {/* Порог и цена балла — две равные плитки: порог отвечает «когда сюда
                попадёшь», цена балла — «что здесь дают». В одной строке с именем
                они не помещались и на телефоне расползались. */}
            <div className={styles.levelFields}>
              <div className={styles.levelField} style={i === 0 ? { opacity: 0.6 } : undefined}>
                <span className={styles.levelFieldLabel}>{t('config.levelFrom')}</span>
                <div className={styles.levelFieldRow}>
                  <span className={styles.levelSuffix}>{currency}</span>
                  <input
                    type="number"
                    className={styles.levelInput}
                    value={lvl.min_threshold}
                    disabled={i === 0}
                    onChange={e => onUpdateLevel(lvl.id, { min_threshold: Number(e.target.value) })}
                  />
                  <span className={styles.levelSuffix}>
                    — {lvl.max_threshold === null ? '∞' : lvl.max_threshold.toLocaleString('ru-RU')}
                  </span>
                </div>
              </div>
              <div className={styles.levelField} style={errors.point_value && lvl.point_value < 1 ? { borderColor: '#D88C9A' } : undefined}>
                <span className={styles.levelFieldLabel}>{t('config.pointValue')}</span>
                <div className={styles.levelFieldRow}>
                  <input
                    type="number"
                    min={1}
                    className={styles.levelInput}
                    value={lvl.point_value}
                    onChange={e => onUpdateLevel(lvl.id, { point_value: Number(e.target.value) })}
                  />
                  <span className={styles.levelSuffix}>{currency}</span>
                </div>
              </div>
            </div>
          </div>
        ))}
        {errors.point_value && <div style={{ fontSize: '11.5px', color: '#D88C9A', fontWeight: 600, marginTop: '4px', marginBottom: '8px' }}>{errors.point_value}</div>}
        <button onClick={onAddLevel} className={styles.levelAdd}>
          {t('config.addLevel')}
        </button>
        {errors.levels && <div style={{ fontSize: '11.5px', color: '#D88C9A', fontWeight: 600, marginTop: '8px' }}>{errors.levels}</div>}
        {deleteTarget && (
          <ConfirmModal
            danger
            title={t('config.deleteLevelTitle')}
            message={t('config.deleteLevelMessage', { name: deleteTarget.name })}
            onConfirm={() => { onRemoveLevel(deleteTarget.id); setDeleteTarget(null); }}
            onClose={() => setDeleteTarget(null)}
          />
        )}
      </div>

      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '16px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{t('config.expiry')}</div>
          <div
            className={styles.tooltipWrap}
            onMouseEnter={e => {
              const box = (e.currentTarget as HTMLElement).querySelector(`.${styles.tooltipBox}`) as HTMLElement;
              const r = e.currentTarget.getBoundingClientRect();
              box.style.top = `${r.top - 38}px`;
              box.style.left = `${r.left + r.width / 2}px`;
            }}
          >
            <div style={{ width: '15px', height: '15px', borderRadius: '50%', background: 'var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 700, color: 'var(--text3)', cursor: 'default' }}>?</div>
            <div className={styles.tooltipBox}>{t('config.expiryTooltip')}</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          {EXPIRY_KEYS.map(key => (
            <button key={key} onClick={() => onChange({ expiry_period: key })} style={{
              padding: '8px 14px', borderRadius: 'var(--radius-sm)',
              border: `1px solid ${expiry === key ? 'rgba(252,174,145,0.4)' : 'var(--border)'}`,
              background: expiry === key ? 'rgba(252,174,145,0.12)' : 'var(--bg)',
              color: expiry === key ? '#FCAE91' : 'var(--text2)',
              fontSize: '12px', fontWeight: 600, cursor: 'pointer',
            }}>
              {t(`config.expiryOptions.${key}`)}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
