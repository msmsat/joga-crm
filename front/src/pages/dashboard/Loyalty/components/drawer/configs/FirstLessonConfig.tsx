import { useTranslation } from 'react-i18next';
import styles from '../../../Loyalty.module.css';
import type { FirstLessonConfig as FirstLessonConfigType } from '../../../../../../api/loyalty/loyalty.types';
import type { ConfigErrors } from '../../../hooks/validateConfig';

interface Props {
  value: FirstLessonConfigType | null;
  onChange: (patch: Partial<FirstLessonConfigType>) => void;
  errors?: ConfigErrors;
}

// Быстрые варианты: подарок целиком и три ходовые скидки. Любой другой процент
// набирается в поле под ними.
const PRESETS = [100, 50, 30, 20] as const;

const sectionTitle: React.CSSProperties = {
  fontSize: '11px', fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase',
  letterSpacing: '0.06em', marginBottom: '16px',
};

/**
 * Скидка на первое занятие. Своей таблицы у программы нет: это правило записи
 * (процент и тумблер хранятся в настройках Онлайн-записи), поэтому она
 * действует везде, где клиент записывается, — в Журнале, мини-приложении и
 * виджете. Сохранение — общей кнопкой дровера «Сохранить и включить».
 */
export default function FirstLessonConfig({ value, onChange, errors = {} }: Props) {
  const { t } = useTranslation('loyalty');
  const percent = value?.discount_percent ?? 100;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
      <div>
        <div style={sectionTitle}>{t('config.firstLesson.sizeTitle')}</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '16px' }}>
          {PRESETS.map(preset => {
            const active = percent === preset;
            return (
              <button
                key={preset}
                type="button"
                onClick={() => onChange({ discount_percent: preset })}
                className={styles.btnOption}
                style={{
                  padding: '8px 14px',
                  border: `1px solid ${active ? 'rgba(252,174,145,0.4)' : 'var(--border)'}`,
                  background: active ? 'rgba(252,174,145,0.12)' : 'var(--bg)',
                  color: active ? '#F9A08B' : 'var(--text2)',
                }}
              >
                {preset === 100 ? t('config.firstLesson.free') : `−${preset}%`}
              </button>
            );
          })}
        </div>

        <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text2)', display: 'block', marginBottom: '6px' }}>
          {t('config.firstLesson.percent')}
        </label>
        <div style={{ position: 'relative' }}>
          <input
            type="number"
            min={1}
            max={100}
            value={percent}
            onChange={e => onChange({ discount_percent: e.target.value === '' ? 0 : Number(e.target.value) })}
            style={{
              width: '100%', padding: '10px 36px 10px 14px', borderRadius: 'var(--radius-sm)',
              border: `1px solid ${errors.discount_percent ? '#D88C9A' : 'var(--border)'}`,
              background: 'var(--bg)', color: 'var(--text)', fontSize: '14px', boxSizing: 'border-box',
            }}
          />
          <span style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', fontSize: '13px', fontWeight: 600, color: 'var(--text3)', pointerEvents: 'none' }}>
            %
          </span>
        </div>
        {errors.discount_percent ? (
          <div style={{ fontSize: '11.5px', color: '#D88C9A', fontWeight: 600, marginTop: '6px' }}>{errors.discount_percent}</div>
        ) : (
          // Что увидит клиент — словами, а не числом: «бесплатно» и «платит
          // 70 % цены» читаются быстрее, чем «скидка 30 %» от незнакомой цены.
          <div style={{ fontSize: '12px', color: 'var(--text3)', marginTop: '8px', lineHeight: 1.5 }}>
            {percent >= 100
              ? t('config.firstLesson.freeHint')
              : t('config.firstLesson.payHint', { rest: 100 - percent })}
          </div>
        )}
      </div>

      <div>
        <div style={sectionTitle}>{t('config.firstLesson.howTitle')}</div>
        <ul style={{ margin: 0, paddingLeft: '18px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {(['who', 'stacking', 'journal', 'booking'] as const).map(key => (
            <li key={key} style={{ fontSize: '12.5px', color: 'var(--text2)', lineHeight: 1.5 }}>
              {t(`config.firstLesson.how.${key}`)}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
