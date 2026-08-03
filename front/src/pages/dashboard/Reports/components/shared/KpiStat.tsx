import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, InfoHint, Tooltip } from '../../../../../components/ui/index';
import { fmtMoney, fmtPct, fmtInt } from '../../../../../lib/format';

export interface KpiStatProps {
  label: string;
  value: number;
  trendPct: number | null;
  formulaKey: string;
  onClick?: () => void;
  format?: 'money' | 'int' | 'pct' | 'decimal';
  currencySymbol?: string;
  /** Полный текст тултипа «метрика не фильтруется» — см. useScopeNote. Капсула
   * показывается только когда прокинут (т.е. хоть один неприменимый фильтр активен). */
  scopeNote?: string;
}

function formatValue(value: number, format: KpiStatProps['format'], currencySymbol?: string): string {
  if (format === 'money') return fmtMoney(value, currencySymbol);
  if (format === 'pct') return fmtPct(value);
  if (format === 'decimal') return value.toFixed(1);
  return fmtInt(value);
}

export function KpiStat({ label, value, trendPct, formulaKey, onClick, format = 'int', currencySymbol, scopeNote }: KpiStatProps) {
  const { t } = useTranslation('reports');
  const [hovered, setHovered] = useState(false);
  const positive = trendPct != null && trendPct >= 0;
  const clickable = !!onClick;

  // Клик мышью уже даёт Card (проп hover), но кликабельную цифру должен быть
  // видно и без наведения (шеврон) и можно было активировать с клавиатуры —
  // "accessibility basics" не упрощаем (EPIC R15 задача 6).
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!onClick) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick();
    }
  };

  return (
    <Card hover={clickable} onClick={onClick}>
      <div
        role={clickable ? 'button' : undefined}
        tabIndex={clickable ? 0 : undefined}
        onKeyDown={clickable ? handleKeyDown : undefined}
        onMouseEnter={clickable ? () => setHovered(true) : undefined}
        onMouseLeave={clickable ? () => setHovered(false) : undefined}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
          <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text3)', minWidth: 0 }}>{label}</span>
          <InfoHint
            title={t(`formulas.${formulaKey}.title`)}
            text={t(`formulas.${formulaKey}.text`)}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '8px' }}>
          {/* clamp вместо жёстких 28px: в двух колонках по 137px на экране
              320px «16 709 ₴» отрывало символ валюты на вторую строку. */}
          <div style={{ fontSize: 'clamp(20px, 6.5vw, 28px)', fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.5px' }}>
            {formatValue(value, format, currencySymbol)}
          </div>
          {clickable && (
            <svg
              width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--text3)" strokeWidth="2.5"
              strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}
            >
              <path
                d="M9 6l8 6-8 6"
                style={{
                  opacity: hovered ? 0.7 : 0.35,
                  transform: hovered ? 'translateX(2px)' : 'translateX(0)',
                  transition: 'opacity 0.2s ease, transform 0.2s ease',
                }}
              />
            </svg>
          )}
        </div>
        {(trendPct != null || scopeNote) && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginTop: '6px' }}>
            {trendPct != null ? (
              <div style={{
                display: 'flex', alignItems: 'center', gap: '4px',
                fontSize: '12px', fontWeight: 700,
                color: positive ? '#5BAB72' : '#D88C9A',
              }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"
                  style={{ transform: positive ? 'none' : 'rotate(180deg)' }}>
                  <polyline points="18 15 12 9 6 15" />
                </svg>
                {fmtPct(trendPct)}
              </div>
            ) : <span />}
            {scopeNote && (
              <Tooltip label={scopeNote} side="top">
                <span style={{
                  fontSize: '10.5px', fontWeight: 600, color: 'var(--text3)',
                  background: 'rgba(var(--ink),0.05)', borderRadius: '6px', padding: '2px 6px',
                }}>
                  {t('scopeNote.label')}
                </span>
              </Tooltip>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
