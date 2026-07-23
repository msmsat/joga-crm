import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import i18n from '../../../../../i18n';
import type { ToastType } from '../../types';
import { useStudioCurrency } from '../../../../../hooks/useStudioCurrency';
import { getCurrencySymbol } from '../../../../../components/UI';
import { InfoHint, Tooltip, Select, Button, useToast } from '../../../../../components/ui/index';
import { Input } from '../../../../../components/ui/modal/Input';
import { staffApi } from '../../../../../api/staff';
import { queryKeys } from '../../../../../api/queryKeys';
import { errorMessage } from '../../../../../api/errorMessage';
import type { SalaryRow } from '../../../../../api/finances/finances.types';
import { useSalaries, useSalaryHistory, useFinanceMutations } from '../../hooks/useFinances';

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(i18n.language, { day: 'numeric', month: 'short', year: 'numeric' });

const ROW_COLORS = ['#5BAB72', '#7EB5D6', '#D88C9A', '#FCAE91', '#A3C9A8'];
const rowColor = (id: number) => ROW_COLORS[id % ROW_COLORS.length];
const initials = (name: string) => name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
const rateTypeLabel = (rt: string | null, t: TFunction) => t(`salaries.rateUnit.${rt === 'hourly' ? 'hourly' : rt === 'percent' ? 'percent' : 'fixed'}`);

// Текущий календарный месяц как период расчёта.
function currentPeriod(): { start: string; end: string } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { start: iso(start), end: iso(end) };
}

export default function SalariesTab({ showToast }: { showToast: (msg: string, t?: ToastType) => void }) {
  const { t } = useTranslation('finances');
  const currency = getCurrencySymbol(useStudioCurrency());
  const fmt = (n: number) => `${currency}${n.toLocaleString('ru-RU')}`;

  const [period] = useState(currentPeriod);
  const { data: rows = [], isLoading: loading, error } = useSalaries(period.start, period.end);
  const { paySalary } = useFinanceMutations();
  const [expanded, setExpanded] = useState<number | null>(null);
  const [payingId, setPayingId] = useState<number | null>(null);

  useEffect(() => {
    if (error) showToast(t('salaries.toasts.loadFailed'), 'error');
  }, [error, showToast, t]);

  const totalFund = rows.reduce((s, r) => s + r.amount, 0);
  const totalSessions = rows.reduce((s, r) => s + r.sessions_count, 0);
  const paidCount = rows.filter(r => r.status === 'paid').length;

  const toggleRow = (id: number) => setExpanded(prev => prev === id ? null : id);

  const handlePay = async (row: typeof rows[number]) => {
    if (payingId) return;
    setPayingId(row.user_id);
    try {
      await paySalary(row.user_id, period.start, period.end);
      showToast(t('salaries.toasts.paid', { name: row.name }), 'success');
    } catch {
      // тост с текстом ошибки сервера уже показан в useFinanceMutations
    } finally {
      setPayingId(null);
    }
  };

  const SUMMARY = [
    { label: t('salaries.fund'), value: fmt(totalFund), sub: t('salaries.fundSub'), color: '#FCAE91' },
    { label: t('salaries.sessions'), value: String(totalSessions), sub: t('salaries.sessionsSub'), color: '#A3C9A8' },
    { label: t('salaries.paid'), value: `${paidCount} / ${rows.length}`, sub: t('salaries.paidOf'), color: '#7EB5D6' },
  ];

  if (loading) {
    return <div style={{ padding: '64px 20px', textAlign: 'center', color: '#999999', fontSize: '14px', fontWeight: 600 }}>{t('salaries.loading')}</div>;
  }

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '14px' }}>
        <div style={{ fontSize: '14px', fontWeight: 800, color: '#1A1A1A' }}>{t('tabs.salaries')}</div>
        <InfoHint title={t('tabs.salaries')} text={t('info.salaries')} />
      </div>

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
          <div style={{ padding: '48px 20px', textAlign: 'center', color: '#999999', fontSize: '13px', fontWeight: 600 }}>{t('salaries.noRows')}</div>
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
                  <div style={{ fontSize: '11px', color: 'var(--text3)' }}>{t('salaries.sessionsCount', { count: row.sessions_count })}</div>
                </div>

                {/* Status pill */}
                <div style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
                  <span style={{ fontSize: '11px', fontWeight: 700, padding: '4px 10px', borderRadius: '6px', color: isPaid ? '#4E885B' : '#B8860B', background: isPaid ? 'rgba(163,201,168,0.2)' : 'rgba(240,192,96,0.18)', textTransform: 'uppercase', letterSpacing: '0.3px' }}>
                    {isPaid ? t('salaries.paid') : t('salaries.pending')}
                  </span>
                </div>

                {/* Rate + amount */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '5px' }}>
                  {row.rate != null && (
                    <span style={{ fontSize: '11px', fontWeight: 700, color, background: color + '18', borderRadius: '6px', padding: '2px 8px' }}>
                      {row.rate_type === 'percent' ? `${row.rate}%` : `${currency}${row.rate}/${rateTypeLabel(row.rate_type, t)}`}
                    </span>
                  )}
                  <span style={{ fontSize: '16px', fontWeight: 800, color: '#1A1A1A' }}>
                    {fmt(row.amount)}<span style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text3)', marginLeft: '3px' }}>{t('salaries.perMonth')}</span>
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
                    {isPaid ? t('salaries.paid') : isPaying ? t('salaries.paying') : t('salaries.payAction')}
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
                  <div style={{ padding: '24px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '28px' }}>
                    {/* Column 1: period stats */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{t('salaries.accrualTitle')}</div>
                      <RateRow row={row} color={color} currency={currency} t={t} />
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '13px', color: 'var(--text3)', fontWeight: 600 }}>{t('salaries.sessionsInPeriod')}</span>
                        <span style={{ fontSize: '13px', fontWeight: 700, color: '#1A1A1A' }}>{row.sessions_count}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '13px', color: 'var(--text3)', fontWeight: 600 }}>{t('salaries.hoursWorked')}</span>
                        <span style={{ fontSize: '13px', fontWeight: 700, color: '#1A1A1A' }}>{row.hours_worked.toLocaleString('ru-RU', { maximumFractionDigits: 1 })}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '13px', color: 'var(--text3)', fontWeight: 600 }}>{t('salaries.lessonsRevenue')}</span>
                        <span style={{ fontSize: '13px', fontWeight: 700, color: '#1A1A1A' }}>{fmt(row.lessons_revenue)}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '8px', borderTop: '1px dashed rgba(26,26,26,0.08)', marginTop: '4px' }}>
                        <span style={{ fontSize: '13px', color: '#1A1A1A', fontWeight: 700 }}>{t('salaries.totalToPay')}</span>
                        <span style={{ fontSize: '22px', fontWeight: 800, color: '#1A1A1A', letterSpacing: '-0.4px' }}>{fmt(row.amount)}</span>
                      </div>
                      {isPaid && row.paid_at && (
                        <div style={{ fontSize: '11px', fontWeight: 700, color: '#4E885B', background: 'rgba(163,201,168,0.16)', borderRadius: '6px', padding: '4px 10px', alignSelf: 'flex-start' }}>
                          {t('salaries.paidAt', { date: fmtDate(row.paid_at) })}
                        </div>
                      )}
                    </div>

                    {/* Column 2: payment history */}
                    <SalaryHistoryColumn userId={row.user_id} enabled={isExpanded} fmt={fmt} t={t} />
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

function SalaryHistoryColumn({ userId, enabled, fmt, t }: {
  userId: number;
  enabled: boolean;
  fmt: (n: number) => string;
  t: TFunction;
}) {
  const { data: history = [], isLoading } = useSalaryHistory(userId, enabled);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', borderLeft: '1px dashed rgba(26,26,26,0.08)', paddingLeft: '28px' }}>
      <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{t('salaries.historyTitle')}</div>
      {isLoading && (
        <div style={{ fontSize: '12px', color: 'var(--text3)', fontWeight: 600 }}>{t('salaries.historyLoading')}</div>
      )}
      {!isLoading && history.length === 0 && (
        <div style={{ fontSize: '12px', color: 'var(--text3)', fontWeight: 600 }}>{t('salaries.historyEmpty')}</div>
      )}
      {!isLoading && history.map(p => (
        <Tooltip key={p.id} label={p.paid_at ? t('salaries.paidAt', { date: fmtDate(p.paid_at) }) : t('salaries.pending')} side="left">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', cursor: 'default' }}>
            <span style={{ fontSize: '12px', color: 'var(--text3)', fontWeight: 600 }}>
              {fmtDate(p.period_start)} – {fmtDate(p.period_end)}
            </span>
            <span style={{ fontSize: '13px', fontWeight: 700, color: '#1A1A1A' }}>{fmt(p.amount)}</span>
          </div>
        </Tooltip>
      ))}
    </div>
  );
}

const RATE_TYPES = ['fixed', 'hourly', 'percent'] as const;

function RateRow({ row, color, currency, t }: {
  row: SalaryRow;
  color: string;
  currency: string;
  t: TFunction;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [rateValue, setRateValue] = useState('');
  const [rateType, setRateType] = useState<string>('fixed');

  const startEdit = () => {
    setRateValue(row.rate != null ? String(row.rate) : '');
    setRateType(row.rate_type ?? 'fixed');
    setEditing(true);
  };

  const saveRate = useMutation({
    mutationFn: async () => {
      const profile = await staffApi.getProfile(row.user_id);
      return staffApi.update(row.user_id, {
        name: profile.name,
        last_name: profile.last_name,
        email: profile.email,
        phone: profile.phone,
        role: profile.role as 'admin' | 'trainer',
        department: profile.department,
        salary: profile.salary,
        rate: rateValue === '' ? null : Number(rateValue),
        rate_type: rateType as 'fixed' | 'hourly' | 'percent',
        service_ids: profile.services.map(s => s.id),
        photo_url: profile.photo_url,
        schedule: profile.week_working_hours,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.finSalariesAll });
      qc.invalidateQueries({ queryKey: queryKeys.staff });
      setEditing(false);
    },
    onError: (err) => toast.error(errorMessage(err, t)),
  });

  if (editing) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
          <div style={{ flex: 1 }}>
            <Input type="number" value={rateValue} onChange={setRateValue} placeholder={t('salaries.rate')} />
          </div>
          <div style={{ flex: 1 }}>
            <Select
              value={rateType}
              onChange={setRateType}
              options={RATE_TYPES.map(rt => ({ value: rt, label: t(`salaries.rateUnit.${rt}`) }))}
            />
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>{t('common.cancel')}</Button>
          <Button variant="primary" size="sm" loading={saveRate.isPending} onClick={() => saveRate.mutate()}>{t('common.save')}</Button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span style={{ fontSize: '13px', color: 'var(--text3)', fontWeight: 600 }}>{t('salaries.rate')}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        {row.rate == null ? (
          <span style={{ fontSize: '11px', color: '#B8860B', fontWeight: 600 }}>{t('salaries.rateWarning')}</span>
        ) : (
          <span style={{ fontSize: '13px', fontWeight: 800, color, background: color + '14', borderRadius: '6px', padding: '3px 10px' }}>
            {row.rate_type === 'percent' ? `${row.rate}%` : `${currency}${row.rate}/${t(`salaries.rateUnit.${row.rate_type === 'hourly' ? 'hourly' : 'fixed'}`)}`}
          </span>
        )}
        <button
          onClick={startEdit}
          style={{ fontSize: '11px', fontWeight: 700, color: '#F9A08B', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px' }}
        >
          {t('common.edit')}
        </button>
      </div>
    </div>
  );
}
