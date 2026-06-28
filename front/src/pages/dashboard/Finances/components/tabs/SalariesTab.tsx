import { useState } from 'react';
import type { ToastType, TrainerSalary } from '../../types';
import { SALARIES_DATA, fmt } from '../../constants';
import styles from '../../Finances.module.css';

export default function SalariesTab({ showToast }: { showToast: (msg: string, t?: ToastType) => void }) {
  const [trainers, setTrainers] = useState<TrainerSalary[]>(SALARIES_DATA);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editRate, setEditRate] = useState('');
  const [editRateType, setEditRateType] = useState<'hourly' | 'fixed'>('hourly');
  const [editSalary, setEditSalary] = useState('');
  const [salaryTouched, setSalaryTouched] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);

  const totalFund = trainers.reduce((s, t) => s + t.salary, 0);
  const totalSessions = trainers.reduce((s, t) => s + t.sessions, 0);
  const avgRating = (trainers.reduce((s, t) => s + t.rating, 0) / trainers.length).toFixed(1);
  const maxSessions = Math.max(...trainers.map(t => t.sessions));

  const toggleRow = (id: number) => {
    const closing = expanded === id;
    setExpanded(closing ? null : id);
    if (closing && editingId === id) setEditingId(null);
  };

  const openEdit = (trainer: TrainerSalary, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setExpanded(trainer.id);
    setEditingId(trainer.id);
    setEditRate(String(trainer.rate));
    setEditRateType(trainer.rate_type);
    setEditSalary(String(trainer.salary));
    setSalaryTouched(false);
  };

  const saveEdit = (trainer: TrainerSalary) => {
    const rate = parseInt(editRate, 10) || trainer.rate;
    const salary = salaryTouched
      ? (parseInt(editSalary, 10) || trainer.salary)
      : (editRateType === 'hourly' ? rate * trainer.hours : rate);
    setTrainers(prev => prev.map(t => t.id === trainer.id ? { ...t, rate, rate_type: editRateType, salary } : t));
    setEditingId(null);
    showToast('Зарплата обновлена', 'success');
  };

  const inp = (field: string): React.CSSProperties => ({
    width: '100%', padding: '10px 14px', background: '#FDFCFB',
    border: focusedField === field ? '1.5px solid #F9A08B' : '1.5px solid rgba(26,26,26,0.08)',
    borderRadius: '8px', fontSize: '13px', fontWeight: 600, color: '#1A1A1A',
    outline: 'none',
    boxShadow: focusedField === field ? '0 0 0 3px rgba(249,160,139,0.12)' : 'none',
    transition: 'border-color 0.18s, box-shadow 0.18s',
    fontFamily: 'var(--font)', boxSizing: 'border-box',
  });

  const SUMMARY = [
    { label: 'Фонд зарплат', value: fmt(totalFund), sub: 'текущий месяц', color: '#FCAE91' },
    { label: 'Тренировок', value: String(totalSessions), sub: 'всего проведено', color: '#A3C9A8' },
    { label: 'Средний рейтинг', value: `${avgRating} ★`, sub: 'по всем тренерам', color: '#7EB5D6' },
  ];

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
        {trainers.map((trainer, i) => {
          const isExpanded = expanded === trainer.id;
          const isEditing = editingId === trainer.id;
          const utilPct = Math.round((trainer.sessions / maxSessions) * 100);
          const avgDuration = Math.round((trainer.hours / trainer.sessions) * 60);
          const autoSalary = editRateType === 'hourly'
            ? (parseInt(editRate, 10) || 0) * trainer.hours
            : (parseInt(editRate, 10) || 0);

          return (
            <div key={trainer.id}>
              {/* ── Collapsed row ── */}
              <div
                onClick={() => toggleRow(trainer.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '16px',
                  padding: '18px 22px', borderBottom: '1px solid var(--border)',
                  background: isExpanded ? 'rgba(252,174,145,0.04)' : 'transparent',
                  cursor: 'pointer', userSelect: 'none', transition: 'background 0.15s',
                }}
              >
                {/* Avatar */}
                <div style={{ width: '46px', height: '46px', borderRadius: '14px', flexShrink: 0, background: trainer.color + '22', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: 800, color: trainer.color }}>
                  {trainer.name.split(' ').map(n => n[0]).join('')}
                </div>

                {/* Name + role */}
                <div style={{ minWidth: '156px' }}>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: '#1A1A1A', marginBottom: '2px' }}>{trainer.name}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text3)' }}>{trainer.role}</div>
                </div>

                {/* Metrics */}
                <div style={{ flex: 1, display: 'flex', gap: '28px', alignItems: 'center' }}>
                  {[
                    { label: 'Выручка', value: `₽${Math.round(trainer.revenue / 1000)}K` },
                    { label: 'Тренировок', value: String(trainer.sessions) },
                    { label: 'Часов', value: String(trainer.hours) },
                  ].map(m => (
                    <div key={m.label}>
                      <div style={{ fontSize: '10px', color: 'var(--text3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px', marginBottom: '2px' }}>{m.label}</div>
                      <div style={{ fontSize: '15px', fontWeight: 800, color: '#1A1A1A' }}>{m.value}</div>
                    </div>
                  ))}
                </div>

                {/* Rate + salary */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '5px' }} onClick={e => e.stopPropagation()}>
                  <span style={{ fontSize: '11px', fontWeight: 700, color: trainer.color, background: trainer.color + '18', borderRadius: '6px', padding: '2px 8px' }}>
                    ₽{trainer.rate}/{trainer.rate_type === 'hourly' ? 'ч' : 'фикс.'}
                  </span>
                  <span style={{ fontSize: '16px', fontWeight: 800, color: '#1A1A1A' }}>
                    {fmt(trainer.salary)}<span style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text3)', marginLeft: '3px' }}>/мес</span>
                  </span>
                </div>

                {/* Edit icon + chevron */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }} onClick={e => e.stopPropagation()}>
                  <button
                    onClick={e => openEdit(trainer, e)}
                    title="Редактировать"
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '32px', height: '32px', background: 'none', border: '1.5px solid rgba(26,26,26,0.08)', borderRadius: '8px', cursor: 'pointer', color: 'var(--text3)', transition: 'all 0.18s' }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = '#F9A08B'; e.currentTarget.style.color = '#F9A08B'; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(26,26,26,0.08)'; e.currentTarget.style.color = 'var(--text3)'; }}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                    </svg>
                  </button>
                  <div style={{ width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text3)', transition: 'transform 0.3s cubic-bezier(0.25, 1, 0.5, 1)', transform: isExpanded ? 'rotate(180deg)' : 'none' }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </div>
                </div>
              </div>

              {/* ── Expanded panel (grid-template-rows animation) ── */}
              <div style={{
                display: 'grid',
                gridTemplateRows: isExpanded ? '1fr' : '0fr',
                transition: 'grid-template-rows 0.35s cubic-bezier(0.25, 1, 0.5, 1)',
                borderBottom: i < trainers.length - 1 ? '1px solid var(--border)' : 'none',
                background: 'rgba(26,26,26,0.015)',
              }}>
                <div style={{ overflow: 'hidden', minHeight: 0 }}>
                  <div style={{ padding: '24px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '32px', alignItems: 'start' }}>

                    {/* ── LEFT: загрузка + stat pills (view) OR edit form ── */}
                    <div key={isEditing ? 'edit' : 'view'} className={styles.morphContainer}>
                      {isEditing ? (
                        /* Edit form — appears left of salary */
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                          <div style={{ fontSize: '12px', fontWeight: 700, color: '#1A1A1A', letterSpacing: '-0.1px' }}>Редактировать начисление</div>

                          {/* Ставка */}
                          <div>
                            <label style={{ display: 'block', fontSize: '10px', fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '7px' }}>Ставка (₽)</label>
                            <input type="number" min={1} autoFocus
                              value={editRate}
                              onChange={e => {
                                setEditRate(e.target.value);
                                if (!salaryTouched) {
                                  const r = parseInt(e.target.value, 10);
                                  if (!isNaN(r)) setEditSalary(String(editRateType === 'hourly' ? r * trainer.hours : r));
                                }
                              }}
                              onFocus={() => setFocusedField('rate')}
                              onBlur={() => setFocusedField(null)}
                              style={inp('rate')}
                            />
                          </div>

                          {/* Тип */}
                          <div>
                            <label style={{ display: 'block', fontSize: '10px', fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '7px' }}>Тип начисления</label>
                            <div style={{ display: 'flex', gap: '6px' }}>
                              {(['hourly', 'fixed'] as const).map(type => (
                                <button key={type}
                                  onClick={() => {
                                    setEditRateType(type);
                                    if (!salaryTouched) {
                                      const r = parseInt(editRate, 10) || 0;
                                      setEditSalary(String(type === 'hourly' ? r * trainer.hours : r));
                                    }
                                  }}
                                  style={{ flex: 1, padding: '9px 0', borderRadius: '8px', fontSize: '12px', fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font)', transition: 'all 0.15s', background: editRateType === type ? '#F9A08B' : 'transparent', border: editRateType === type ? 'none' : '1.5px solid rgba(26,26,26,0.1)', color: editRateType === type ? '#fff' : '#888', boxShadow: editRateType === type ? '0 3px 10px rgba(249,160,139,0.22)' : 'none' }}
                                >
                                  {type === 'hourly' ? 'Почасово' : 'Фикс.'}
                                </button>
                              ))}
                            </div>
                          </div>

                          {/* Зарплата */}
                          <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '7px' }}>
                              <label style={{ fontSize: '10px', fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Итого / мес (₽)</label>
                              {!salaryTouched && (
                                <span style={{ fontSize: '10px', color: 'var(--text3)', fontWeight: 600 }}>
                                  ○ авто: {fmt(autoSalary)}
                                </span>
                              )}
                            </div>
                            <input type="number" min={0}
                              value={editSalary}
                              onChange={e => { setSalaryTouched(true); setEditSalary(e.target.value); }}
                              onFocus={() => { setSalaryTouched(true); setFocusedField('salary'); }}
                              onBlur={() => setFocusedField(null)}
                              style={inp('salary')}
                            />
                          </div>

                          {/* Buttons */}
                          <div style={{ display: 'flex', gap: '8px', paddingTop: '4px' }}>
                            <button
                              onClick={() => saveEdit(trainer)}
                              style={{ flex: 1, padding: '10px', background: 'linear-gradient(135deg, #FCAE91, #F5866E)', border: 'none', borderRadius: '8px', color: '#fff', fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font)', boxShadow: '0 4px 14px rgba(249,160,139,0.28)', transition: 'filter 0.15s' }}
                              onMouseEnter={e => e.currentTarget.style.filter = 'brightness(1.06)'}
                              onMouseLeave={e => e.currentTarget.style.filter = 'none'}
                            >
                              Сохранить
                            </button>
                            <button
                              onClick={() => setEditingId(null)}
                              style={{ padding: '10px 16px', background: 'none', border: '1.5px solid rgba(26,26,26,0.1)', borderRadius: '8px', color: '#666', fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font)', transition: 'all 0.15s' }}
                              onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(26,26,26,0.22)'; e.currentTarget.style.color = '#333'; }}
                              onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(26,26,26,0.1)'; e.currentTarget.style.color = '#666'; }}
                            >
                              Отмена
                            </button>
                          </div>
                        </div>
                      ) : (
                        /* View: загрузка + stat pills */
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

                          {/* Utilization */}
                          <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                              <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Загрузка</span>
                              <span style={{ fontSize: '11px', fontWeight: 800, color: trainer.color }}>{utilPct}%</span>
                            </div>
                            <div style={{ height: '8px', background: 'rgba(26,26,26,0.06)', borderRadius: '4px', overflow: 'hidden' }}>
                              <div style={{ height: '100%', width: `${utilPct}%`, background: trainer.color, borderRadius: '4px', transition: 'width 0.6s cubic-bezier(0.34,1.56,0.64,1)' }} />
                            </div>
                          </div>

                          {/* Stat pills */}
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                            {[
                              { label: 'Рейтинг', value: `${trainer.rating} ★` },
                              { label: 'Топ-класс', value: trainer.topClass },
                              { label: 'Ср. длина', value: `${avgDuration} мин` },
                            ].map(pill => (
                              <div key={pill.label} style={{ padding: '8px 14px', borderRadius: '20px', background: trainer.color + '18' }}>
                                <div style={{ fontSize: '9px', fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.3px', marginBottom: '2px' }}>{pill.label}</div>
                                <div style={{ fontSize: '13px', fontWeight: 800, color: trainer.color }}>{pill.value}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* ── RIGHT: salary breakdown (always visible) ── */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', borderLeft: '1px solid var(--border)', paddingLeft: '32px' }}>
                      <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        Начисление
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '13px', color: 'var(--text3)', fontWeight: 600 }}>Ставка</span>
                        <span style={{ fontSize: '13px', fontWeight: 800, color: trainer.color, background: trainer.color + '14', borderRadius: '6px', padding: '3px 10px' }}>
                          ₽{trainer.rate}/{trainer.rate_type === 'hourly' ? 'ч' : 'фикс.'}
                        </span>
                      </div>
                      {trainer.rate_type === 'hourly' && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '12px', color: 'var(--text3)', fontWeight: 500 }}>{trainer.hours} ч × ₽{trainer.rate}</span>
                          <span style={{ fontSize: '12px', fontWeight: 700, color: '#999' }}>{fmt(trainer.hours * trainer.rate)}</span>
                        </div>
                      )}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '8px', borderTop: '1px dashed rgba(26,26,26,0.08)', marginTop: '4px' }}>
                        <span style={{ fontSize: '13px', color: '#1A1A1A', fontWeight: 700 }}>Итого / мес</span>
                        <span style={{ fontSize: '22px', fontWeight: 800, color: '#1A1A1A', letterSpacing: '-0.4px' }}>{fmt(trainer.salary)}</span>
                      </div>

                      {/* Свернуть */}
                      <button
                        onClick={() => toggleRow(trainer.id)}
                        style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '7px 12px', background: 'rgba(26,26,26,0.04)', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '11px', fontWeight: 700, color: '#888', fontFamily: 'var(--font)', transition: 'background 0.15s', marginTop: '8px', alignSelf: 'flex-start' }}
                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(26,26,26,0.08)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'rgba(26,26,26,0.04)'}
                      >
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="18 15 12 9 6 15" />
                        </svg>
                        Свернуть
                      </button>
                    </div>

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
