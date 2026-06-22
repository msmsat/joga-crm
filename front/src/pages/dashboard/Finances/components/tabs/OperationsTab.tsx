import { useState } from 'react';
import type { ToastType } from '../../types';
import { OPERATIONS_DATA, fmt } from '../../constants';
import { Ico } from '../ui/FinanceIcons';

export default function OperationsTab({ showToast, initialSearch }: {
  showToast: (msg: string, t?: ToastType) => void;
  initialSearch: string;
}) {
  const [search, setSearch] = useState(initialSearch || '');
  const [filter, setFilter] = useState<'all' | 'income' | 'expense'>('all');
  const [expanded, setExpanded] = useState<number | null>(null);
  const [isSearchFocused, setIsSearchFocused] = useState(false);

  const filtered = OPERATIONS_DATA.filter(op => {
    const matchFilter = filter === 'all' || op.type === filter;
    const matchSearch = !search ||
      op.title.toLowerCase().includes(search.toLowerCase()) ||
      op.client.toLowerCase().includes(search.toLowerCase()) ||
      op.category.toLowerCase().includes(search.toLowerCase()) ||
      (op.account && op.account.toLowerCase().includes(search.toLowerCase()));
    return matchFilter && matchSearch;
  });

  const totalIncome = OPERATIONS_DATA.filter(o => o.type === 'income').reduce((s, o) => s + Math.abs(o.amount), 0);
  const totalExpense = OPERATIONS_DATA.filter(o => o.type === 'expense').reduce((s, o) => s + Math.abs(o.amount), 0);
  const balance = totalIncome - totalExpense;

  return (
    <>
      {/* 1. Сводные карточки */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px', marginBottom: '28px' }}>
        <div style={{ background: '#FFFFFF', borderRadius: '16px', padding: '24px', border: '1px solid rgba(26,26,26,0.04)', boxShadow: '0 12px 32px -4px rgba(26,26,26,0.02)', position: 'relative', overflow: 'hidden', transition: 'transform 0.2s', cursor: 'default' }} onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'} onMouseLeave={e => e.currentTarget.style.transform = 'none'}>
          <div style={{ position: 'absolute', top: '-20px', right: '-20px', width: '100px', height: '100px', background: 'radial-gradient(circle, rgba(163,201,168,0.15) 0%, transparent 70%)', borderRadius: '50%' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '12px', background: 'rgba(163,201,168,0.12)', color: '#5BAB72', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Ico.Up /></div>
            <div style={{ fontSize: '12px', color: '#666666', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px' }}>Приход сегодня</div>
          </div>
          <div style={{ fontSize: '32px', fontWeight: 800, color: '#1A1A1A', letterSpacing: '-1px' }}>
            <span style={{ color: '#5BAB72', marginRight: '4px' }}>+</span>{fmt(totalIncome)}
          </div>
        </div>

        <div style={{ background: '#FFFFFF', borderRadius: '16px', padding: '24px', border: '1px solid rgba(26,26,26,0.04)', boxShadow: '0 12px 32px -4px rgba(26,26,26,0.02)', position: 'relative', overflow: 'hidden', transition: 'transform 0.2s', cursor: 'default' }} onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'} onMouseLeave={e => e.currentTarget.style.transform = 'none'}>
          <div style={{ position: 'absolute', top: '-20px', right: '-20px', width: '100px', height: '100px', background: 'radial-gradient(circle, rgba(216,140,154,0.12) 0%, transparent 70%)', borderRadius: '50%' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '12px', background: 'rgba(216,140,154,0.12)', color: '#D88C9A', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Ico.Down /></div>
            <div style={{ fontSize: '12px', color: '#666666', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px' }}>Расход сегодня</div>
          </div>
          <div style={{ fontSize: '32px', fontWeight: 800, color: '#1A1A1A', letterSpacing: '-1px' }}>
            <span style={{ color: '#D88C9A', marginRight: '4px' }}>−</span>{fmt(totalExpense)}
          </div>
        </div>

        <div style={{ background: '#FFFFFF', borderRadius: '16px', padding: '24px', border: '1px solid rgba(26,26,26,0.04)', boxShadow: '0 12px 32px -4px rgba(26,26,26,0.02)', position: 'relative', overflow: 'hidden', transition: 'transform 0.2s', cursor: 'default' }} onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'} onMouseLeave={e => e.currentTarget.style.transform = 'none'}>
          <div style={{ position: 'absolute', top: '-20px', right: '-20px', width: '100px', height: '100px', background: 'radial-gradient(circle, rgba(249,160,139,0.15) 0%, transparent 70%)', borderRadius: '50%' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '12px', background: 'rgba(249,160,139,0.12)', color: '#F9A08B', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Ico.Dollar /></div>
            <div style={{ fontSize: '12px', color: '#666666', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px' }}>Баланс дня</div>
          </div>
          <div style={{ fontSize: '32px', fontWeight: 800, color: '#1A1A1A', letterSpacing: '-1px' }}>
            <span style={{ color: balance >= 0 ? '#F9A08B' : '#D88C9A', marginRight: '4px' }}>{balance >= 0 ? '+' : '−'}</span>{fmt(Math.abs(balance))}
          </div>
        </div>
      </div>

      {/* 2. Панель управления */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px', background: '#FFFFFF', padding: '12px 16px', borderRadius: '16px', border: '1px solid rgba(26,26,26,0.04)', boxShadow: '0 8px 32px -8px rgba(26,26,26,0.04)', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: '250px' }}>
          <div style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: isSearchFocused ? '#F9A08B' : '#999999', transition: 'color 0.2s', pointerEvents: 'none' }}><Ico.Search /></div>
          <input type="text" placeholder="Поиск по клиентам, счетам и категориям..." value={search} onChange={e => setSearch(e.target.value)} onFocus={() => setIsSearchFocused(true)} onBlur={() => setIsSearchFocused(false)} style={{ width: '100%', height: '48px', paddingLeft: '44px', paddingRight: search ? '40px' : '16px', background: '#FDFCFB', border: isSearchFocused ? '1.5px solid #F9A08B' : '1.5px solid rgba(26,26,26,0.06)', borderRadius: '12px', fontSize: '14px', fontWeight: 500, color: '#1A1A1A', outline: 'none', boxShadow: isSearchFocused ? '0 0 0 3px rgba(249, 160, 139, 0.12)' : 'none', transition: 'all 0.25s cubic-bezier(0.2, 0.8, 0.2, 1)', boxSizing: 'border-box', fontFamily: "'Manrope', sans-serif" }} />
          {search && (
            <button onClick={() => setSearch('')} style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', width: '24px', height: '24px', borderRadius: '50%', background: 'rgba(26,26,26,0.06)', border: 'none', cursor: 'pointer', color: '#666', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }} onMouseEnter={e => e.currentTarget.style.background='rgba(26,26,26,0.1)'} onMouseLeave={e => e.currentTarget.style.background='rgba(26,26,26,0.06)'}>
              <Ico.X />
            </button>
          )}
        </div>

        <div style={{ display: 'flex', gap: '4px', background: 'rgba(26,26,26,0.03)', padding: '4px', borderRadius: '12px', flexShrink: 0 }}>
          {(['all', 'income', 'expense'] as const).map(f => {
            const isActive = filter === f;
            return (
              <button key={f} onClick={() => setFilter(f)} style={{ padding: '8px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 700, border: 'none', cursor: 'pointer', fontFamily: "'Manrope', sans-serif", background: isActive ? '#FFFFFF' : 'transparent', color: isActive ? '#1A1A1A' : '#666666', boxShadow: isActive ? '0 2px 8px rgba(26,26,26,0.06)' : 'none', transition: 'all 0.2s cubic-bezier(0.2, 0.8, 0.2, 1)' }}>
                {f === 'all' ? 'Все' : f === 'income' ? 'Приход' : 'Расход'}
              </button>
            );
          })}
        </div>

        <button onClick={() => showToast('Экспорт запущен', 'info')} style={{ display: 'flex', alignItems: 'center', gap: '8px', height: '40px', padding: '0 16px', background: 'transparent', border: '1.5px solid rgba(26,26,26,0.08)', borderRadius: '10px', color: '#666666', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: "'Manrope', sans-serif", transition: 'all 0.2s cubic-bezier(0.2, 0.8, 0.2, 1)', flexShrink: 0 }} onMouseEnter={e => { e.currentTarget.style.background = 'rgba(26,26,26,0.03)'; e.currentTarget.style.color = '#1A1A1A'; e.currentTarget.style.borderColor = 'rgba(26,26,26,0.15)'; }} onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#666666'; e.currentTarget.style.borderColor = 'rgba(26,26,26,0.08)'; }}>
          <Ico.Download /> Экспорт
        </button>
      </div>

      {/* 3. Список операций */}
      {filtered.length === 0 ? (
        <div style={{ background: '#FFFFFF', borderRadius: '16px', padding: '64px 20px', textAlign: 'center', border: '1px dashed rgba(26,26,26,0.1)' }}>
          <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'rgba(26,26,26,0.03)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', color: '#999999' }}><Ico.Search /></div>
          <div style={{ fontSize: '16px', fontWeight: 800, color: '#1A1A1A', marginBottom: '6px' }}>Операции не найдены</div>
          <div style={{ fontSize: '13px', color: '#666666' }}>Попробуйте изменить параметры поиска или фильтры</div>
        </div>
      ) : (
        <div style={{ background: '#FFFFFF', borderRadius: '16px', border: '1px solid rgba(26,26,26,0.12)', boxShadow: '0 12px 32px -4px rgba(26,26,26,0.02)', overflow: 'hidden' }}>
          {filtered.map((op, i) => {
            const isIncome = op.type === 'income';
            const color = isIncome ? '#5BAB72' : '#D88C9A';
            const bgLight = isIncome ? 'rgba(163,201,168,0.12)' : 'rgba(216,140,154,0.12)';
            const isOpen = expanded === op.id;

            return (
              <div key={op.id} style={{ borderBottom: i < filtered.length - 1 ? '1px solid rgba(26,26,26,0.12)' : 'none' }}>
                <div
                  onClick={() => setExpanded(isOpen ? null : op.id)}
                  style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '16px 24px', cursor: 'pointer', background: isOpen ? 'rgba(249,160,139,0.02)' : 'transparent', transition: 'background 0.2s' }}
                  onMouseEnter={e => { if (!isOpen) e.currentTarget.style.background = 'rgba(26,26,26,0.01)'; }}
                  onMouseLeave={e => { if (!isOpen) e.currentTarget.style.background = 'transparent'; }}
                >
                  <div style={{ width: '42px', height: '42px', borderRadius: '12px', background: bgLight, color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {isIncome ? <Ico.Up /> : <Ico.Down />}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '14px', fontWeight: 700, color: '#1A1A1A', marginBottom: '3px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {op.title}
                      {op.status === 'pending' && (
                        <span style={{ fontSize: '10px', background: '#FFF3CD', color: '#856404', padding: '2px 8px', borderRadius: '20px', fontWeight: 700 }}>Ожидание</span>
                      )}
                    </div>
                    <div style={{ fontSize: '12px', color: '#666666' }}>{op.client} <span style={{ opacity: 0.5, margin: '0 4px' }}>•</span> {op.account || op.category}</div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0, paddingRight: '12px' }}>
                    <div style={{ fontSize: '15px', fontWeight: 800, color, letterSpacing: '-0.3px' }}>{isIncome ? '+' : '−'}{fmt(Math.abs(op.amount))}</div>
                    <div style={{ fontSize: '11px', color: '#999999', marginTop: '3px', fontWeight: 500 }}>{op.date}</div>
                  </div>
                  <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: isOpen ? 'rgba(26,26,26,0.06)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999', transition: 'all 0.2s', transform: isOpen ? 'rotate(90deg)' : 'none', flexShrink: 0 }}>
                    <Ico.Chevron />
                  </div>
                </div>

                {isOpen && (
                  <div style={{ background: 'rgba(252,174,145,0.03)', padding: '20px 24px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '24px', borderTop: '1px solid rgba(252,174,145,0.1)' }}>
                    {[['Счёт поступления', op.account || '—'], ['Категория', op.category], ['Метод оплаты', op.method]].map(([l, v]) => (
                      <div key={l as string}>
                        <div style={{ fontSize: '11px', color: '#666666', fontWeight: 700, marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.4px' }}>{l}</div>
                        <div style={{ fontSize: '14px', fontWeight: 700, color: '#1A1A1A' }}>{v}</div>
                      </div>
                    ))}
                    <div style={{ gridColumn: '1 / -1', display: 'flex', gap: '10px', paddingTop: '16px', borderTop: '1px solid rgba(26,26,26,0.05)', marginTop: '-4px' }}>
                      <button onClick={() => showToast('Редактирование открыто')} style={{ padding: '8px 16px', background: '#FFFFFF', border: '1px solid rgba(26,26,26,0.08)', borderRadius: '8px', fontSize: '12px', fontWeight: 700, color: '#1A1A1A', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', transition: 'all 0.2s', boxShadow: '0 2px 6px rgba(0,0,0,0.02)' }} onMouseEnter={e => { e.currentTarget.style.borderColor = '#F9A08B'; e.currentTarget.style.color = '#F9A08B'; }} onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(26,26,26,0.08)'; e.currentTarget.style.color = '#1A1A1A'; }}><Ico.Edit /> Изменить</button>
                      <button onClick={() => showToast('Квитанция скачана', 'success')} style={{ padding: '8px 16px', background: '#FFFFFF', border: '1px solid rgba(26,26,26,0.08)', borderRadius: '8px', fontSize: '12px', fontWeight: 700, color: '#1A1A1A', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', transition: 'all 0.2s', boxShadow: '0 2px 6px rgba(0,0,0,0.02)' }} onMouseEnter={e => { e.currentTarget.style.borderColor = '#F9A08B'; e.currentTarget.style.color = '#F9A08B'; }} onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(26,26,26,0.08)'; e.currentTarget.style.color = '#1A1A1A'; }}><Ico.Doc /> Квитанция</button>
                      <button onClick={() => showToast('Операция удалена', 'error')} style={{ padding: '8px 16px', background: 'transparent', border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: 700, color: '#D88C9A', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', transition: 'all 0.2s', marginLeft: 'auto' }} onMouseEnter={e => { e.currentTarget.style.background = '#FFF5F5'; }} onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}><Ico.Trash /> Удалить</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
