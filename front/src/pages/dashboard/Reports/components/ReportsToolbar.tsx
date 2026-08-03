import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Select, usePopoverPosition } from '../../../../components/ui/index';
import type { SelectOption } from '../../../../components/ui/index';
import { usePhone } from '../../../../hooks/usePhone';
import s from '../Reports.module.css';
import { MIN_REPORT_DATE, TAB_FILTERS } from '../constants';
import type { Tab, ReportPeriod, ReportFilters } from '../types';

const PERIODS: ReportPeriod[] = ['day', 'week', 'month', 'year', 'custom'];

function PeriodSelector({ value, onChange }: { value: ReportPeriod; onChange: (p: ReportPeriod) => void }) {
  const { t } = useTranslation('reports');
  return (
    <div className="rt-periods" style={{
      display: 'flex', background: 'rgba(var(--ink),0.04)', borderRadius: '10px',
      padding: '3px', gap: '2px', border: '1px solid var(--border)',
    }}>
      {PERIODS.map((p) => (
        <button key={p} onClick={() => onChange(p)} className="rt-period" style={{
          padding: 'var(--rt-period-pad, 5px 12px)', borderRadius: '8px', border: 'none', cursor: 'pointer',
          minWidth: 'var(--rt-period-w, 62px)',
          fontSize: '12px', fontWeight: 700, fontFamily: 'var(--font)',
          transition: 'all 0.2s cubic-bezier(0.34,1.2,0.64,1)',
          background: value === p ? 'var(--bg-card)' : 'transparent',
          color: value === p ? 'var(--text)' : 'var(--text3)',
          boxShadow: value === p ? '0 1px 6px rgba(26,26,26,0.1)' : 'none',
          transform: value === p ? 'translateY(-0.5px)' : 'none',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto',
        }}>
          {t(`toolbar.period.${p}`)}
        </button>
      ))}
    </div>
  );
}

const dateInputStyle: CSSProperties = {
  padding: '6px 8px', borderRadius: '8px', border: '1px solid var(--border)',
  fontSize: '12px', fontFamily: 'var(--font)', color: 'var(--text)', background: 'var(--bg-card, #fff)',
};

/**
 * Дата с границами. Пока год добирается посимвольно, браузер шлёт промежуточные
 * значения (2 → «0002-…»), поэтому наружу уходит только дата внутри [min..max];
 * всё остальное живёт в черновике и на blur подтягивается к границе (2024 → 2025).
 */
function DateField({ value, min, max, onCommit }: { value: string; min: string; max: string; onCommit: (v: string) => void }) {
  // draft !== null только пока поле правят: после blur показываем уже применённую дату.
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <input
      type="date" value={draft ?? value} min={min} max={max} style={dateInputStyle}
      onChange={e => {
        setDraft(e.target.value);
        if (e.target.value >= min && e.target.value <= max) onCommit(e.target.value);
      }}
      onBlur={() => { onCommit(draft ?? value); setDraft(null); }}
    />
  );
}

function DateRangeInputs({ from, to, onChange }: { from: string; to: string; onChange: (from: string, to: string) => void }) {
  const today = new Date().toISOString().slice(0, 10);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
      <DateField value={from} min={MIN_REPORT_DATE} max={to || today} onCommit={v => onChange(v, to)} />
      <span style={{ color: 'var(--text3)', fontSize: '12px' }}>—</span>
      <DateField value={to} min={from || MIN_REPORT_DATE} max={today} onCommit={v => onChange(from, v)} />
    </div>
  );
}

/**
 * Телефон: пять сегментов периода — это 280px, то есть вся строка, и кнопка
 * экспорта уезжала на свою. Вместо сегментов — одна кнопка во всю оставшуюся
 * ширину с текущим периодом; выбор и поля произвольного диапазона живут в
 * поповере, который она открывает. Экспорт остаётся справа от неё.
 */
function PeriodPicker({
  value, from, to, onChange, onRangeChange,
}: {
  value: ReportPeriod;
  from: string;
  to: string;
  onChange: (p: ReportPeriod) => void;
  onRangeChange: (from: string, to: string) => void;
}) {
  const { t } = useTranslation('reports');
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const close = () => setOpen(false);
  const placement = usePopoverPosition(open, btnRef, popRef, 'bottom', close);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    const onClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (btnRef.current?.contains(target) || popRef.current?.contains(target)) return;
      close();
    };
    window.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClick);
    };
  }, [open]);

  // Произвольный период подписан самим диапазоном: слово «произвольный» на
  // кнопке не говорит, какие даты выбраны.
  const label = value === 'custom' && from && to
    ? `${fmtShort(from)} — ${fmtShort(to)}`
    : t(`toolbar.period.${value}`);

  return (
    <>
      <button ref={btnRef} type="button" className="rt-period-btn" onClick={() => setOpen(o => !o)}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
          <rect x="3" y="4" width="18" height="18" rx="2.5" /><path d="M3 10h18M8 2v4M16 2v4" />
        </svg>
        <span className="rt-period-btn-label">{label}</span>
        <svg className="rt-period-btn-chev" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && createPortal(
        <div
          ref={popRef}
          className="rt-period-pop"
          role="dialog"
          style={{
            position: 'fixed',
            top: placement ? `${placement.top}px` : 0,
            left: placement ? `${placement.left}px` : 0,
            visibility: placement ? 'visible' : 'hidden',
            zIndex: 1200,
          }}
        >
          {PERIODS.map(p => (
            <button
              key={p}
              type="button"
              className={`rt-period-opt${value === p ? ' active' : ''}`}
              onClick={() => { onChange(p); if (p !== 'custom') close(); }}
            >
              {t(`toolbar.period.${p}`)}
              {value === p && (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
            </button>
          ))}

          {value === 'custom' && (
            <div className="rt-period-range">
              <DateRangeInputs from={from} to={to} onChange={onRangeChange} />
            </div>
          )}
        </div>,
        document.body
      )}
    </>
  );
}

function fmtShort(iso: string): string {
  if (!iso) return '';
  const [, m, d] = iso.split('-');
  return `${d}.${m}`;
}

function ComparisonBadge({ from, to, visible }: { from: string; to: string; visible: boolean }) {
  const { t } = useTranslation('reports');
  return (
    // На узком экране бейдж «vs предыдущий период» скрывается (.rt-vs) —
    // это подпись к цифрам, а не управляющий элемент.
    <div className="rt-vs" style={{
      padding: '5px 10px', borderRadius: '8px', background: 'rgba(var(--ink),0.04)',
      fontSize: '11px', fontWeight: 600, color: 'var(--text3)', whiteSpace: 'nowrap',
      minWidth: '172px', textAlign: 'center', flexShrink: 0, fontVariantNumeric: 'tabular-nums',
      visibility: visible ? 'visible' : 'hidden',
    }}>
      {visible ? t('toolbar.vsPrevious', { from: fmtShort(from), to: fmtShort(to) }) : ''}
    </div>
  );
}

const CsvIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
    <polyline points="7 10 12 15 17 10"/>
    <line x1="12" y1="15" x2="12" y2="3"/>
  </svg>
);

export interface FilterOptions {
  branches: SelectOption[];
  halls: SelectOption[];
  trainers: SelectOption[];
  services: SelectOption[];
}

export interface ReportsToolbarProps {
  tabs: Tab[];
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
  filters: ReportFilters;
  comparisonRange: { from: string; to: string } | null;
  options: FilterOptions;
  onPeriodChange: (p: ReportPeriod) => void;
  onCustomRangeChange: (from: string, to: string) => void;
  onFilterChange: (key: 'branchId' | 'hallId' | 'trainerId' | 'serviceId', value: number | null) => void;
  onExport: () => void;
}

export function ReportsToolbar({
  tabs, activeTab, onTabChange,
  filters, comparisonRange, options,
  onPeriodChange, onCustomRangeChange, onFilterChange,
  onExport,
}: ReportsToolbarProps) {
  const { t } = useTranslation('reports');
  const [exported, setExported] = useState(false);
  const visibleFilters = TAB_FILTERS[activeTab];
  const isPhone = usePhone();

  const fire = () => {
    onExport();
    setExported(true);
    setTimeout(() => setExported(false), 2500);
  };

  const selectFilter = (
    key: 'branchId' | 'hallId' | 'trainerId' | 'serviceId',
    value: number | null,
    allOptions: SelectOption[],
    allLabel: string,
  ) => (
    <div className={s.barFilter} key={key}>
      <Select
        value={value != null ? String(value) : ''}
        options={[{ value: '', label: allLabel }, ...allOptions]}
        onChange={v => onFilterChange(key, v ? Number(v) : null)}
      />
    </div>
  );

  return (
    <>
      <style>{`
        @keyframes rtToastIn { from{opacity:0;transform:translateX(-50%) translateY(8px)} to{opacity:1;transform:translateX(-50%) translateY(0)} }
        @media (max-width: 1400px) { .rt-vs { display: none; } }
        /* Планшет: период и экспорт ужимаются, чтобы фильтры влезли в тот же
           ряд. У экспорта остаётся иконка — подпись дублирует и title, и
           единственную кнопку такого цвета на экране. */
        @media (max-width: 1024px) {
          :root { --rt-period-w: 0px; --rt-period-pad: 5px 9px; }
          .rt-export { padding: 8px !important; }
          .rt-export-label { display: none; }
        }

        /* Телефон: кнопка периода тянется на всю строку, кроме экспорта */
        .rt-period-btn {
          display: flex; align-items: center; gap: 8px;
          flex: 1 1 0; min-width: 0;
          padding: 8px 11px; border-radius: 10px;
          border: 1px solid var(--border);
          background: var(--bg-card);
          color: var(--text2);
          font-size: 12.5px; font-weight: 700; font-family: var(--font);
          cursor: pointer; -webkit-tap-highlight-color: transparent;
        }
        .rt-period-btn svg { flex-shrink: 0; }
        .rt-period-btn-label {
          flex: 1; min-width: 0; text-align: left; color: var(--text);
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .rt-period-btn-chev { opacity: 0.5; }

        .rt-period-pop {
          width: min(260px, calc(100vw - 24px));
          padding: 6px;
          background: var(--bg-card, #FFFFFF);
          border: 1px solid rgba(var(--ink),0.08);
          border-radius: 14px;
          box-shadow: 0 24px 56px -12px rgba(26,26,26,0.24), 0 6px 16px -8px rgba(26,26,26,0.1);
          font-family: var(--font, 'Manrope', sans-serif);
          box-sizing: border-box;
        }
        .rt-period-opt {
          display: flex; align-items: center; justify-content: space-between; gap: 8px;
          width: 100%; padding: 10px 11px;
          border: none; border-radius: 9px; background: none;
          font-size: 13px; font-weight: 700; font-family: inherit;
          color: var(--text2); cursor: pointer; text-align: left;
        }
        .rt-period-opt.active { background: rgba(249,160,139,0.1); color: #F9A08B; }
        .rt-period-range {
          margin-top: 4px; padding: 10px 11px 4px;
          border-top: 1px dashed rgba(var(--ink),0.1);
        }
        .rt-period-range input { flex: 1 1 0; min-width: 0; }
      `}</style>

      {exported && (
        <div style={{
          position: 'fixed', bottom: '24px', left: '50%', transform: 'translateX(-50%)',
          background: 'var(--onyx)', color: 'var(--bg)', padding: '12px 20px', borderRadius: '12px',
          fontSize: '13px', fontWeight: 700, fontFamily: 'var(--font)',
          boxShadow: '0 8px 24px rgba(0,0,0,0.2)', zIndex: 9999, whiteSpace: 'nowrap',
          animation: 'rtToastIn 0.22s cubic-bezier(0.34,1.56,0.64,1)',
          display: 'flex', alignItems: 'center', gap: '8px',
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#5BAB72" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
          {t('export.csv')}
        </div>
      )}

      {/* Один контейнер на три группы: строки собирает flex-basis, а не
          разметка, поэтому на планшете фильтры переезжают в ряд к периоду
          без второго варианта JSX (см. .bar в Reports.module.css). */}
      <div className={s.bar}>
        <div className={`tabs ${s.barTabs}`} style={{ margin: 0 }}>
          {tabs.map(tab => (
            <div key={tab} className={`tab ${activeTab === tab ? 'active' : ''}`} onClick={() => onTabChange(tab)}>
              {t(`tabs.${tab}`)}
            </div>
          ))}
        </div>

        {/* wrap, а не nowrap: на ноутбуке период + диапазон + бейдж + экспорт
            в одну строку не влезали и уезжали за край карточки. Пустой
            «резерв» под диапазон дат тоже убран — он висел даже когда период
            не «произвольный», и съедал 236px просто так. */}
        <div className={s.barCtl}>
          {isPhone ? (
            <PeriodPicker
              value={filters.period}
              from={filters.dateFrom}
              to={filters.dateTo}
              onChange={onPeriodChange}
              onRangeChange={onCustomRangeChange}
            />
          ) : (
            <>
              <PeriodSelector value={filters.period} onChange={onPeriodChange} />
              {filters.period === 'custom' && (
                <div className="rt-dates" style={{ flexShrink: 0 }}>
                  <DateRangeInputs from={filters.dateFrom} to={filters.dateTo} onChange={onCustomRangeChange} />
                </div>
              )}
            </>
          )}
          <ComparisonBadge from={comparisonRange?.from ?? ''} to={comparisonRange?.to ?? ''} visible={!!comparisonRange} />
          <button
            onClick={fire}
            className="rt-export"
            title={t('toolbar.export')}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '7px 14px', borderRadius: '10px', border: 'none',
              background: 'linear-gradient(135deg,#FCAE91,#F9A08B)',
              fontSize: '12px', fontWeight: 700, color: '#fff',
              cursor: 'pointer', fontFamily: 'var(--font)',
              boxShadow: '0 4px 14px rgba(249,160,139,0.3)',
              flexShrink: 0,
            }}
          >
            <CsvIcon /><span className="rt-export-label">{t('toolbar.export')}</span>
          </button>
        </div>

        <div className={s.barFilters}>
          {visibleFilters.includes('branch') && selectFilter('branchId', filters.branchId, options.branches, t('toolbar.allBranches'))}
          {visibleFilters.includes('hall') && selectFilter('hallId', filters.hallId, options.halls, t('toolbar.allHalls'))}
          {visibleFilters.includes('trainer') && selectFilter('trainerId', filters.trainerId, options.trainers, t('toolbar.allTrainers'))}
          {visibleFilters.includes('service') && selectFilter('serviceId', filters.serviceId, options.services, t('toolbar.allServices'))}
        </div>
      </div>
    </>
  );
}
