import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Select } from '../../../../components/ui/index';
import type { SelectOption } from '../../../../components/ui/index';
import type { Tab, ReportPeriod, ReportFilters } from '../types';

const PERIODS: ReportPeriod[] = ['day', 'week', 'month', 'year', 'custom'];

function PeriodSelector({ value, onChange }: { value: ReportPeriod; onChange: (p: ReportPeriod) => void }) {
  const { t } = useTranslation('reports');
  return (
    <div style={{
      display: 'flex', background: 'rgba(26,26,26,0.04)', borderRadius: '10px',
      padding: '3px', gap: '2px', border: '1px solid var(--border)',
    }}>
      {PERIODS.map((p) => (
        <button key={p} onClick={() => onChange(p)} style={{
          padding: '5px 12px', borderRadius: '8px', border: 'none', cursor: 'pointer',
          fontSize: '12px', fontWeight: 700, fontFamily: 'var(--font)',
          transition: 'all 0.2s cubic-bezier(0.34,1.2,0.64,1)',
          background: value === p ? '#fff' : 'transparent',
          color: value === p ? 'var(--text)' : 'var(--text3)',
          boxShadow: value === p ? '0 1px 6px rgba(26,26,26,0.1)' : 'none',
          transform: value === p ? 'translateY(-0.5px)' : 'none',
        }}>
          {t(`toolbar.period.${p}`)}
        </button>
      ))}
    </div>
  );
}

function DateRangeInputs({ from, to, onChange }: { from: string; to: string; onChange: (from: string, to: string) => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
      <input
        type="date" value={from} onChange={e => onChange(e.target.value, to)}
        style={{
          padding: '6px 8px', borderRadius: '8px', border: '1px solid var(--border)',
          fontSize: '12px', fontFamily: 'var(--font)', color: 'var(--text)', background: 'var(--bg-card, #fff)',
        }}
      />
      <span style={{ color: 'var(--text3)', fontSize: '12px' }}>—</span>
      <input
        type="date" value={to} onChange={e => onChange(from, e.target.value)}
        style={{
          padding: '6px 8px', borderRadius: '8px', border: '1px solid var(--border)',
          fontSize: '12px', fontFamily: 'var(--font)', color: 'var(--text)', background: 'var(--bg-card, #fff)',
        }}
      />
    </div>
  );
}

function fmtShort(iso: string): string {
  if (!iso) return '';
  const [, m, d] = iso.split('-');
  return `${d}.${m}`;
}

function ComparisonBadge({ from, to }: { from: string; to: string }) {
  const { t } = useTranslation('reports');
  return (
    <div style={{
      padding: '5px 10px', borderRadius: '8px', background: 'rgba(26,26,26,0.04)',
      fontSize: '11px', fontWeight: 600, color: 'var(--text3)', whiteSpace: 'nowrap',
    }}>
      {t('toolbar.vsPrevious', { from: fmtShort(from), to: fmtShort(to) })}
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
    <div style={{ minWidth: '140px' }}>
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
      `}</style>

      {exported && (
        <div style={{
          position: 'fixed', bottom: '24px', left: '50%', transform: 'translateX(-50%)',
          background: '#1A1A1A', color: '#fff', padding: '12px 20px', borderRadius: '12px',
          fontSize: '13px', fontWeight: 700, fontFamily: 'var(--font)',
          boxShadow: '0 8px 24px rgba(0,0,0,0.2)', zIndex: 9999, whiteSpace: 'nowrap',
          animation: 'rtToastIn 0.22s cubic-bezier(0.34,1.56,0.64,1)',
          display: 'flex', alignItems: 'center', gap: '8px',
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#5BAB72" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
          {t('export.csv')}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
        <div className="tabs" style={{ margin: 0 }}>
          {tabs.map(tab => (
            <div key={tab} className={`tab ${activeTab === tab ? 'active' : ''}`} onClick={() => onTabChange(tab)}>
              {t(`tabs.${tab}`)}
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <PeriodSelector value={filters.period} onChange={onPeriodChange} />
          {filters.period === 'custom' && (
            <DateRangeInputs from={filters.dateFrom} to={filters.dateTo} onChange={onCustomRangeChange} />
          )}
          {comparisonRange && <ComparisonBadge from={comparisonRange.from} to={comparisonRange.to} />}
          <button
            onClick={fire}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '7px 14px', borderRadius: '10px', border: 'none',
              background: 'linear-gradient(135deg,#FCAE91,#F9A08B)',
              fontSize: '12px', fontWeight: 700, color: '#fff',
              cursor: 'pointer', fontFamily: 'var(--font)',
              boxShadow: '0 4px 14px rgba(249,160,139,0.3)',
            }}
          >
            <CsvIcon />{t('toolbar.export')}
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '20px' }}>
        {selectFilter('branchId', filters.branchId, options.branches, t('toolbar.allBranches'))}
        {selectFilter('hallId', filters.hallId, options.halls, t('toolbar.allHalls'))}
        {selectFilter('trainerId', filters.trainerId, options.trainers, t('toolbar.allTrainers'))}
        {selectFilter('serviceId', filters.serviceId, options.services, t('toolbar.allServices'))}
      </div>
    </>
  );
}
