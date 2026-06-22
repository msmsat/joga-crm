import { useState } from 'react';
import type { Tab, Period } from '../types';
import { PERIOD_LABELS } from '../constants';
import type { ServiceRecord } from '../types';

// ─── PERIOD SELECTOR ─────────────────────────────────────────────────────────
function PeriodSelector({ value, onChange }: { value: Period; onChange: (p: Period) => void }) {
  return (
    <div style={{
      display: 'flex', background: 'rgba(26,26,26,0.04)', borderRadius: '10px',
      padding: '3px', gap: '2px', border: '1px solid var(--border)',
    }}>
      {(['day', 'week', 'month', 'year'] as Period[]).map((p) => (
        <button key={p} onClick={() => onChange(p)} style={{
          padding: '5px 12px', borderRadius: '8px', border: 'none', cursor: 'pointer',
          fontSize: '12px', fontWeight: 700, fontFamily: 'var(--font)',
          transition: 'all 0.2s cubic-bezier(0.34,1.2,0.64,1)',
          background: value === p ? '#fff' : 'transparent',
          color: value === p ? 'var(--text)' : 'var(--text3)',
          boxShadow: value === p ? '0 1px 6px rgba(26,26,26,0.1)' : 'none',
          transform: value === p ? 'translateY(-0.5px)' : 'none',
        }}>
          {PERIOD_LABELS[p]}
        </button>
      ))}
    </div>
  );
}

// ─── EXPORT DROPDOWN ─────────────────────────────────────────────────────────
function ExportMenu({ onCSV, onPDF }: { onCSV: () => void; onPDF: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          display: 'flex', alignItems: 'center', gap: '6px',
          padding: '7px 14px', borderRadius: '10px', border: 'none',
          background: 'linear-gradient(135deg,#FCAE91,#F9A08B)',
          fontSize: '12px', fontWeight: 700, color: '#fff',
          cursor: 'pointer', fontFamily: 'var(--font)',
          boxShadow: '0 4px 14px rgba(249,160,139,0.3)',
          transition: 'all 0.2s',
        }}
        onMouseEnter={e => { e.currentTarget.style.filter = 'brightness(1.06)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
        onMouseLeave={e => { e.currentTarget.style.filter = ''; e.currentTarget.style.transform = ''; }}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="7 10 12 15 17 10"/>
          <line x1="12" y1="15" x2="12" y2="3"/>
        </svg>
        Экспорт
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5"
          style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>

      {open && (
        <div
          style={{
            position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 50,
            background: '#fff', borderRadius: '12px', border: '1px solid var(--border)',
            boxShadow: '0 12px 32px -8px rgba(26,26,26,0.14)',
            overflow: 'hidden', minWidth: '150px',
            animation: 'rtDropIn 0.18s cubic-bezier(0.34,1.56,0.64,1)',
          }}
          onMouseLeave={() => setOpen(false)}
        >
          {[
            { label: 'Скачать CSV', icon: '📊', action: onCSV },
            { label: 'Печать PDF',  icon: '🖨️',  action: onPDF },
          ].map(({ label, icon, action }) => (
            <button key={label} onClick={() => { action(); setOpen(false); }}
              style={{
                width: '100%', padding: '11px 16px', border: 'none', background: 'transparent',
                display: 'flex', alignItems: 'center', gap: '8px',
                fontSize: '12px', fontWeight: 600, color: 'var(--text)',
                cursor: 'pointer', fontFamily: 'var(--font)', textAlign: 'left', transition: 'background 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(249,160,139,0.07)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
            >
              <span>{icon}</span>{label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── EXPORTED COMPONENT ───────────────────────────────────────────────────────
export interface ReportsToolbarProps {
  tabs: Tab[];
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
  period: Period;
  onPeriodChange: (p: Period) => void;
  showPeriod: boolean;
  onExport: (rows: Record<string, unknown>[], filename: string) => void;
  exportData?: ServiceRecord[];
}

export function ReportsToolbar({
  tabs, activeTab, onTabChange,
  period, onPeriodChange, showPeriod,
  onExport, exportData = [],
}: ReportsToolbarProps) {
  const handleCSV = () => onExport(exportData as unknown as Record<string, unknown>[], `reports-${period}`);
  const handlePDF = () => window.print();

  return (
    <>
      <style>{`
        @keyframes rtDropIn {
          from { opacity: 0; transform: translateY(-6px) scale(0.97) }
          to   { opacity: 1; transform: translateY(0) scale(1) }
        }
      `}</style>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: '20px', flexWrap: 'wrap', gap: '12px',
      }}>
        <div className="tabs" style={{ margin: 0 }}>
          {tabs.map(tab => (
            <div
              key={tab}
              className={`tab ${activeTab === tab ? 'active' : ''}`}
              onClick={() => onTabChange(tab)}
            >
              {tab}
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {showPeriod && <PeriodSelector value={period} onChange={onPeriodChange}/>}
          <ExportMenu onCSV={handleCSV} onPDF={handlePDF}/>
        </div>
      </div>
    </>
  );
}
