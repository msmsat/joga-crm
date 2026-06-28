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

const CsvIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
    <polyline points="14 2 14 8 20 8"/>
    <line x1="8" y1="13" x2="16" y2="13"/>
    <line x1="8" y1="17" x2="16" y2="17"/>
    <line x1="10" y1="9" x2="10" y2="9"/>
  </svg>
);

const PrintIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="6 9 6 2 18 2 18 9"/>
    <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
    <rect x="6" y="14" width="12" height="8"/>
  </svg>
);

// ─── EXPORT DROPDOWN ─────────────────────────────────────────────────────────
function ExportMenu({ onCSV, onPDF }: { onCSV: () => void; onPDF: () => void }) {
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const fire = (msg: string, action: () => void) => {
    action();
    setOpen(false);
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  return (
    <>
      <style>{`
        @keyframes exportToastIn {
          from { opacity: 0; transform: translateX(-50%) translateY(8px); }
          to   { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
      `}</style>

      {toast && (
        <div style={{
          position: 'fixed', bottom: '24px', left: '50%', transform: 'translateX(-50%)',
          background: '#1A1A1A', color: '#fff',
          padding: '12px 20px', borderRadius: '12px',
          fontSize: '13px', fontWeight: 700, fontFamily: 'var(--font)',
          boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
          zIndex: 9999, whiteSpace: 'nowrap',
          animation: 'exportToastIn 0.22s cubic-bezier(0.34,1.56,0.64,1)',
          display: 'flex', alignItems: 'center', gap: '8px',
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#5BAB72" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
          {toast}
        </div>
      )}

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
              { label: 'Скачать CSV', Icon: CsvIcon,   action: () => fire('CSV экспортирован', onCSV) },
              { label: 'Печать PDF',  Icon: PrintIcon, action: () => fire('Отправлено на печать', onPDF) },
            ].map(({ label, Icon, action }) => (
              <button key={label} onClick={action}
                style={{
                  width: '100%', padding: '11px 16px', border: 'none', background: 'transparent',
                  display: 'flex', alignItems: 'center', gap: '8px',
                  fontSize: '12px', fontWeight: 600, color: 'var(--text)',
                  cursor: 'pointer', fontFamily: 'var(--font)', textAlign: 'left', transition: 'background 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(249,160,139,0.07)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
              >
                <Icon/>{label}
              </button>
            ))}
          </div>
        )}
      </div>
    </>
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
