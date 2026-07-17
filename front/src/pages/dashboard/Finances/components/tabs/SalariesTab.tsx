import { useEffect, useRef, useState } from 'react';
import type { ToastType } from '../../types';
import type { SalaryRow } from '../../../../../api/finances/finances.types';
import { financesApi } from '../../../../../api/finances/finances.api';
import { fmt } from '../../constants';

const ROW_COLORS = ['#5BAB72', '#7EB5D6', '#D88C9A', '#FCAE91', '#A3C9A8'];
const rowColor = (id: number) => ROW_COLORS[id % ROW_COLORS.length];
const initials = (name: string) => name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
const rateTypeLabel = (t: string | null) => t === 'hourly' ? 'ч' : t === 'percent' ? '%' : 'фикс.';

// Текущий календарный месяц как период расчёта.
function currentPeriod(): { start: string; end: string } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { start: iso(start), end: iso(end) };
}

export default function SalariesTab({ showToast }: { showToast: (msg: string, t?: ToastType) => void }) {
  const [rows, setRows] = useState<SalaryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [payingId, setPayingId] = useState<number | null>(null);

  const period = useRef(currentPeriod()).current;
  const toastRef = useRef(showToast);
  toastRef.current = showToast;

  useEffect(() => {
    financesApi.getSalaries(period.start, period.end)
      .then(setRows)
      .catch(() => toastRef.current('Не удалось загрузить расчёты', 'error'))
      .finally(() => setLoading(false));
  }, [period.start, period.end]);

  const totalFund = rows.reduce((s, r) => s + r.amount, 0);
  const totalSessions = rows.reduce((s, r) => s + r.sessions_count, 0);
  const paidCount = rows.filter(r => r.status === 'paid').length;

  const toggleRow = (id: number) => setExpanded(prev => prev === id ? null : id);

  const handlePay = async (row: SalaryRow) => {
    if (payingId) return;
    setPayingId(row.user_id);
    try {
      await financesApi.paySalary(row.user_id, { period_start: period.start, period_end: period.end });
      setRows(prev => prev.map(r => r.user_id === row.user_id ? { ...r, status: 'paid' } : r));
      showToast(`Зарплата выплачена: ${row.name}`, 'success');
    } catch {
      showToast('Не удалось выплатить зарплату', 'error');
    } finally {
      setPayingId(null);
    }
  };

  const SUMMARY = [
    { label: 'Фонд зарплат', value: fmt(totalFund), sub: 'текущий месяц', color: '#FCAE91' },
    { label: 'Тренировок', value: String(totalSessions), sub: 'всего проведено', color: '#A3C9A8' },
    { label: 'Выплачено', value: `${paidCount} / ${rows.length}`, sub: 'сотрудников', color: '#7EB5D6' },
  ];

  if (loading) {
    return <div style={{ padding: '64px 20px', textAlign: 'center', color: '#999999', fontSize: '14px', fontWeight: 600 }}>Загрузка расчётов…</div>;
  }

  return (
    <>
      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px', marginBottom: '20px' }}>
        {SUMMARY.map(s => (
          <div key={s.label} className="card" style={{ padding: '22px 24px', display: 'flex', flexDirection: 'column', gap: '6px', borderLeft: `3px solid ${s.color}` }}>
            <div style={{ fontSize: '11px', color: 'var(--text3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px' }}>{s.label}</div>
            <div style={{ fontSize: '26px', fontWeight: 800, color: '#1A1A1A', letterSpacing: '-0.5px', lineHeight: 1 }}>{s.value}</div>
            <div style={{ fontSize: '11px', color: 'var(--text3)' }}>{s.sub}</div>
          </div>
        ))}
      </div>

      {/* Trainer list */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {rows.length === 0 && (
          <div style={{ padding: '48px 20px', textAlign: 'center', color: '#999999', fontSize: '13px', fontWeight: 600 }}>Нет сотрудников для расчёта</div>
        )}
        {rows.map((row, i) => {
          const color = rowColor(row.user_id);
          const isExpanded = expanded === row.user_id;
          const isPaid = row.status === 'paid';
          const isPaying = payingId === row.user_id;

          return (
            <div key={row.user_id}>
              {/* ── Collapsed row ── */}
              <div
                onClick={() => toggleRow(row.user_id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '16px',
                  padding: '18px 22px', borderBottom: '1px solid var(--border)',
                  background: isExpanded ? 'rgba(252,174,145,0.04)' : 'transparent',
                  cursor: 'pointer', userSelect: 'none', transition: 'background 0.15s',
                }}
              >
                {/* Avatar */}
                <div style={{ width: '46px', height: '46px', borderRadius: '14px', flexShrink: 0, background: color + '22', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: 800, color }}>
                  {initials(row.name)}
                </div>

                {/* Name */}
                <div style={{ minWidth: '156px' }}>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: '#1A1A1A', marginBottom: '2px' }}>{row.name}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text3)' }}>{row.sessions_count} тренировок</div>
                </div>

                {/* Status pill */}
                <div style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
                  <span style={{ fontSize: '11px', fontWeight: 700, padding: '4px 10px', borderRadius: '6px', color: isPaid ? '#4E885B' : '#B8860B', background: isPaid ? 'rgba(163,201,168,0.2)' : 'rgba(240,192,96,0.18)', textTransform: 'uppercase', letterSpacing: '0.3px' }}>
                    {isPaid ? 'Выплачено' : 'Ожидает'}
                  </span>
                </div>

                {/* Rate + amount */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '5px' }}>
                  {row.rate != null && (
                    <span style={{ fontSize: '11px', fontWeight: 700, color, background: color + '18', borderRadius: '6px', padding: '2px 8px' }}>
                      {row.rate_type === 'percent' ? `${row.rate}%` : `₽${row.rate}/${rateTypeLabel(row.rate_type)}`}
                    </span>
                  )}
                  <span style={{ fontSize: '16px', fontWeight: 800, color: '#1A1A1A' }}>
                    {fmt(row.amount)}<span style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text3)', marginLeft: '3px' }}>/мес</span>
                  </span>
                </div>

                {/* Pay button + chevron */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }} onClick={e => e.stopPropagation()}>
                  <button
                    onClick={() => handlePay(row)}
                    disabled={isPaid || isPaying}
                    style={{
                      height: '36px', padding: '0 16px', borderRadius: '8px', border: 'none',
                      fontSize: '12px', fontWeight: 700, fontFamily: 'var(--font)',
                      cursor: isPaid || isPaying ? 'default' : 'pointer',
                      background: isPaid ? 'rgba(26,26,26,0.05)' : '#F9A08B',
                      color: isPaid ? '#999' : '#fff',
                      boxShadow: isPaid ? 'none' : '0 4px 14px rgba(249,160,139,0.28)',
                      transition: 'filter 0.15s',
                    }}
                    onMouseEnter={e => { if (!isPaid && !isPaying) e.currentTarget.style.filter = 'brightness(1.06)'; }}
                    onMouseLeave={e => e.currentTarget.style.filter = 'none'}
                  >
                    {isPaid ? 'Выплачено' : isPaying ? '…' : 'Выплатить'}
                  </button>
                  <div style={{ width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text3)', transition: 'transform 0.3s cubic-bezier(0.25, 1, 0.5, 1)', transform: isExpanded ? 'rotate(180deg)' : 'none' }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </div>
                </div>
              </div>

              {/* ── Expanded panel ── */}
              <div style={{
                display: 'grid',
                gridTemplateRows: isExpanded ? '1fr' : '0fr',
                transition: 'grid-template-rows 0.35s cubic-bezier(0.25, 1, 0.5, 1)',
                borderBottom: i < rows.length - 1 ? '1px solid var(--border)' : 'none',
                background: 'rgba(26,26,26,0.015)',
              }}>
                <div style={{ overflow: 'hidden', minHeight: 0 }}>
                  <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '12px', maxWidth: '440px' }}>
                    <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Начисление за период</div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '13px', color: 'var(--text3)', fontWeight: 600 }}>Ставка</span>
                      <span style={{ fontSize: '13px', fontWeight: 800, color, background: color + '14', borderRadius: '6px', padding: '3px 10px' }}>
                        {row.rate == null ? 'не задана' : row.rate_type === 'percent' ? `${row.rate}%` : `₽${row.rate}/${rateTypeLabel(row.rate_type)}`}
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '13px', color: 'var(--text3)', fontWeight: 600 }}>Тренировок за период</span>
                      <span style={{ fontSize: '13px', fontWeight: 700, color: '#1A1A1A' }}>{row.sessions_count}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '8px', borderTop: '1px dashed rgba(26,26,26,0.08)', marginTop: '4px' }}>
                      <span style={{ fontSize: '13px', color: '#1A1A1A', fontWeight: 700 }}>Итого к выплате</span>
                      <span style={{ fontSize: '22px', fontWeight: 800, color: '#1A1A1A', letterSpacing: '-0.4px' }}>{fmt(row.amount)}</span>
                    </div>
                    {row.rate == null && (
                      <div style={{ fontSize: '11px', color: '#B8860B', fontWeight: 600 }}>
                        Ставка не задана — укажите её в профиле сотрудника, чтобы начисление рассчиталось.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
