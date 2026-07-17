import { useCallback, useEffect, useRef, useState } from 'react';
import type { ToastType } from '../../types';
import type { Account, Operation } from '../../../../../api/finances/finances.types';
import { financesApi } from '../../../../../api/finances/finances.api';
import { fmt } from '../../constants';
import { Ico } from '../ui/FinanceIcons';
import styles from '../../Finances.module.css';

const PAGE_SIZE = 20;
const todayISO = () => new Date().toISOString().slice(0, 10);

export default function OperationsTab({ showToast, initialSearch }: {
  showToast: (msg: string, t?: ToastType) => void;
  initialSearch: string;
}) {
  const [operations, setOperations] = useState<Operation[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [accounts, setAccounts] = useState<Account[]>([]);

  const [search, setSearch] = useState(initialSearch || '');
  const [filter, setFilter] = useState<'all' | 'in' | 'out'>('all');
  const [expanded, setExpanded] = useState<number | null>(null);
  const [isSearchFocused, setIsSearchFocused] = useState(false);

  // Форма создания
  const [addOpen, setAddOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [nType, setNType] = useState<'in' | 'out'>('in');
  const [nTitle, setNTitle] = useState('');
  const [nAmount, setNAmount] = useState('');
  const [nCategory, setNCategory] = useState('');
  const [nAccountId, setNAccountId] = useState<number | ''>('');
  const [nDate, setNDate] = useState(todayISO());
  const [addFocused, setAddFocused] = useState<string | null>(null);

  // showToast — новая ссылка каждый рендер родителя; держим в ref, чтобы эффекты не перезапускались
  const toastRef = useRef(showToast);
  toastRef.current = showToast;

  const accountName = useCallback(
    (id: number | null) => accounts.find(a => a.id === id)?.name ?? '',
    [accounts],
  );

  // Серверная загрузка: фильтр вкладки + поиск → параметры; offset для «Загрузить ещё».
  const load = useCallback(async (offset: number) => {
    const page = await financesApi.getOperations({
      type: filter === 'all' ? undefined : filter,
      search: search.trim() || undefined,
      offset,
      limit: PAGE_SIZE,
    });
    setTotal(page.total);
    setOperations(prev => (offset === 0 ? page.items : [...prev, ...page.items]));
  }, [filter, search]);

  // Дебаунс поиска + сброс на смену фильтра
  const firstRun = useRef(true);
  useEffect(() => {
    const delay = firstRun.current ? 0 : 300;
    firstRun.current = false;
    const t = setTimeout(() => {
      setLoading(true);
      setExpanded(null);
      load(0)
        .catch(() => toastRef.current('Не удалось загрузить операции', 'error'))
        .finally(() => setLoading(false));
    }, delay);
    return () => clearTimeout(t);
  }, [load]);

  useEffect(() => {
    financesApi.getAccounts().then(setAccounts).catch(() => {});
  }, []);

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      await load(operations.length);
    } catch {
      showToast('Не удалось догрузить операции', 'error');
    } finally {
      setLoadingMore(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await financesApi.deleteOperation(id);
      setOperations(prev => prev.filter(o => o.id !== id));
      setTotal(t => Math.max(0, t - 1));
      setExpanded(null);
      showToast('Операция удалена', 'error');
    } catch {
      showToast('Не удалось удалить операцию', 'error');
    }
  };

  const resetForm = () => {
    setNType('in'); setNTitle(''); setNAmount(''); setNCategory('');
    setNAccountId(''); setNDate(todayISO());
  };

  const handleCreate = async () => {
    if (!nTitle.trim() || saving) return;
    const amount = parseInt(nAmount) || 0;
    if (amount <= 0) { showToast('Введите сумму', 'error'); return; }
    setSaving(true);
    try {
      await financesApi.createOperation({
        type: nType,
        title: nTitle.trim(),
        amount,
        op_date: nDate,
        category: nCategory.trim() || undefined,
        account_id: nAccountId === '' ? undefined : nAccountId,
      });
      resetForm();
      setAddOpen(false);
      setLoading(true);
      await load(0);         // перезагружаем первую страницу — новая операция сверху
      await financesApi.getAccounts().then(setAccounts);  // баланс счёта сдвинулся
      showToast('Операция создана', 'success');
    } catch {
      showToast('Не удалось создать операцию', 'error');
    } finally {
      setSaving(false);
      setLoading(false);
    }
  };

  const totalIncome = operations.filter(o => o.type === 'in').reduce((s, o) => s + o.amount, 0);
  const totalExpense = operations.filter(o => o.type === 'out').reduce((s, o) => s + o.amount, 0);
  const balance = totalIncome - totalExpense;

  const inp = (key: string): React.CSSProperties => ({
    width: '100%', padding: '10px 12px', background: '#FDFCFB',
    border: addFocused === key ? '1.5px solid #F9A08B' : '1.5px solid rgba(26,26,26,0.08)',
    borderRadius: '8px', fontSize: '13px', fontWeight: 600, color: '#1A1A1A', outline: 'none',
    boxShadow: addFocused === key ? '0 0 0 3px rgba(249,160,139,0.12)' : 'none',
    transition: 'border-color 0.18s, box-shadow 0.18s', fontFamily: "'Manrope', sans-serif", boxSizing: 'border-box',
  });

  return (
    <>
      {/* 1. Сводные карточки — по загруженным операциям */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px', marginBottom: '28px' }}>
        <div style={{ background: '#FFFFFF', borderRadius: '16px', padding: '24px', border: '1px solid rgba(26,26,26,0.04)', boxShadow: '0 12px 32px -4px rgba(26,26,26,0.02)', position: 'relative', overflow: 'hidden', transition: 'transform 0.2s', cursor: 'default' }} onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'} onMouseLeave={e => e.currentTarget.style.transform = 'none'}>
          <div style={{ position: 'absolute', top: '-20px', right: '-20px', width: '100px', height: '100px', background: 'radial-gradient(circle, rgba(163,201,168,0.15) 0%, transparent 70%)', borderRadius: '50%' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '12px', background: 'rgba(163,201,168,0.12)', color: '#5BAB72', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Ico.Up /></div>
            <div style={{ fontSize: '12px', color: '#666666', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px' }}>Приход</div>
          </div>
          <div style={{ fontSize: '32px', fontWeight: 800, color: '#1A1A1A', letterSpacing: '-1px' }}>
            <span style={{ color: '#5BAB72', marginRight: '4px' }}>+</span>{fmt(totalIncome)}
          </div>
        </div>

        <div style={{ background: '#FFFFFF', borderRadius: '16px', padding: '24px', border: '1px solid rgba(26,26,26,0.04)', boxShadow: '0 12px 32px -4px rgba(26,26,26,0.02)', position: 'relative', overflow: 'hidden', transition: 'transform 0.2s', cursor: 'default' }} onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'} onMouseLeave={e => e.currentTarget.style.transform = 'none'}>
          <div style={{ position: 'absolute', top: '-20px', right: '-20px', width: '100px', height: '100px', background: 'radial-gradient(circle, rgba(216,140,154,0.12) 0%, transparent 70%)', borderRadius: '50%' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '12px', background: 'rgba(216,140,154,0.12)', color: '#D88C9A', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Ico.Down /></div>
            <div style={{ fontSize: '12px', color: '#666666', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px' }}>Расход</div>
          </div>
          <div style={{ fontSize: '32px', fontWeight: 800, color: '#1A1A1A', letterSpacing: '-1px' }}>
            <span style={{ color: '#D88C9A', marginRight: '4px' }}>−</span>{fmt(totalExpense)}
          </div>
        </div>

        <div style={{ background: '#FFFFFF', borderRadius: '16px', padding: '24px', border: '1px solid rgba(26,26,26,0.04)', boxShadow: '0 12px 32px -4px rgba(26,26,26,0.02)', position: 'relative', overflow: 'hidden', transition: 'transform 0.2s', cursor: 'default' }} onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'} onMouseLeave={e => e.currentTarget.style.transform = 'none'}>
          <div style={{ position: 'absolute', top: '-20px', right: '-20px', width: '100px', height: '100px', background: 'radial-gradient(circle, rgba(249,160,139,0.15) 0%, transparent 70%)', borderRadius: '50%' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '12px', background: 'rgba(249,160,139,0.12)', color: '#F9A08B', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Ico.Dollar /></div>
            <div style={{ fontSize: '12px', color: '#666666', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px' }}>Баланс</div>
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
          <input type="text" placeholder="Поиск по названию и категории..." value={search} onChange={e => setSearch(e.target.value)} onFocus={() => setIsSearchFocused(true)} onBlur={() => setIsSearchFocused(false)} style={{ width: '100%', height: '48px', paddingLeft: '44px', paddingRight: search ? '40px' : '16px', background: '#FDFCFB', border: isSearchFocused ? '1.5px solid #F9A08B' : '1.5px solid rgba(26,26,26,0.06)', borderRadius: '12px', fontSize: '14px', fontWeight: 500, color: '#1A1A1A', outline: 'none', boxShadow: isSearchFocused ? '0 0 0 3px rgba(249, 160, 139, 0.12)' : 'none', transition: 'all 0.25s cubic-bezier(0.2, 0.8, 0.2, 1)', boxSizing: 'border-box', fontFamily: "'Manrope', sans-serif" }} />
          {search && (
            <button onClick={() => setSearch('')} style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', width: '24px', height: '24px', borderRadius: '50%', background: 'rgba(26,26,26,0.06)', border: 'none', cursor: 'pointer', color: '#666', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }} onMouseEnter={e => e.currentTarget.style.background='rgba(26,26,26,0.1)'} onMouseLeave={e => e.currentTarget.style.background='rgba(26,26,26,0.06)'}>
              <Ico.X />
            </button>
          )}
        </div>

        <div style={{ display: 'flex', gap: '4px', background: 'rgba(26,26,26,0.03)', padding: '4px', borderRadius: '12px', flexShrink: 0 }}>
          {(['all', 'in', 'out'] as const).map(f => {
            const isActive = filter === f;
            return (
              <button key={f} onClick={() => setFilter(f)} style={{ padding: '8px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 700, border: 'none', cursor: 'pointer', fontFamily: "'Manrope', sans-serif", background: isActive ? '#FFFFFF' : 'transparent', color: isActive ? '#1A1A1A' : '#666666', boxShadow: isActive ? '0 2px 8px rgba(26,26,26,0.06)' : 'none', transition: 'all 0.2s cubic-bezier(0.2, 0.8, 0.2, 1)' }}>
                {f === 'all' ? 'Все' : f === 'in' ? 'Приход' : 'Расход'}
              </button>
            );
          })}
        </div>

        <button onClick={() => setAddOpen(o => !o)} style={{ display: 'flex', alignItems: 'center', gap: '8px', height: '40px', padding: '0 18px', background: addOpen ? 'rgba(249,160,139,0.08)' : '#F9A08B', border: addOpen ? '1.5px solid #F9A08B' : 'none', borderRadius: '10px', color: addOpen ? '#F9A08B' : '#FFFFFF', fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: "'Manrope', sans-serif", transition: 'all 0.2s', flexShrink: 0 }}>
          <Ico.Plus /> {addOpen ? 'Закрыть' : 'Операция'}
        </button>

        <button onClick={() => showToast('Экспорт запущен', 'info')} style={{ display: 'flex', alignItems: 'center', gap: '8px', height: '40px', padding: '0 16px', background: 'transparent', border: '1.5px solid rgba(26,26,26,0.08)', borderRadius: '10px', color: '#666666', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: "'Manrope', sans-serif", transition: 'all 0.2s cubic-bezier(0.2, 0.8, 0.2, 1)', flexShrink: 0 }} onMouseEnter={e => { e.currentTarget.style.background = 'rgba(26,26,26,0.03)'; e.currentTarget.style.color = '#1A1A1A'; e.currentTarget.style.borderColor = 'rgba(26,26,26,0.15)'; }} onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#666666'; e.currentTarget.style.borderColor = 'rgba(26,26,26,0.08)'; }}>
          <Ico.Download /> Экспорт
        </button>
      </div>

      {/* Форма создания операции */}
      {addOpen && (
        <div className={styles.morphContainer} style={{ background: '#FFFFFF', borderRadius: '16px', border: '1.5px solid #F9A08B', padding: '24px', marginBottom: '24px', boxShadow: '0 12px 28px rgba(249,160,139,0.06)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '18px' }}>
            <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(249,160,139,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#F9A08B' }}><Ico.Plus /></div>
            <div style={{ fontSize: '13px', fontWeight: 800, color: '#1A1A1A' }}>Новая операция</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
            <div style={{ display: 'flex', gap: '6px', gridColumn: '1 / -1' }}>
              {(['in', 'out'] as const).map(t => (
                <button key={t} type="button" onClick={() => setNType(t)} style={{ flex: 1, padding: '10px', background: nType === t ? (t === 'in' ? 'rgba(163,201,168,0.12)' : 'rgba(216,140,154,0.12)') : '#FDFCFB', border: nType === t ? `1.5px solid ${t === 'in' ? '#5BAB72' : '#D88C9A'}` : '1.5px solid rgba(26,26,26,0.08)', borderRadius: '8px', fontSize: '13px', fontWeight: 700, color: nType === t ? (t === 'in' ? '#5BAB72' : '#D88C9A') : '#666666', cursor: 'pointer', transition: 'all 0.15s' }}>
                  {t === 'in' ? 'Приход' : 'Расход'}
                </button>
              ))}
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <div style={{ fontSize: '11px', color: '#666666', fontWeight: 700, marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Название</div>
              <input value={nTitle} onChange={e => setNTitle(e.target.value)} onFocus={() => setAddFocused('t')} onBlur={() => setAddFocused(null)} placeholder="Например, Оплата абонемента" style={inp('t')} />
            </div>
            <div>
              <div style={{ fontSize: '11px', color: '#666666', fontWeight: 700, marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Сумма, ₽</div>
              <input value={nAmount} onChange={e => setNAmount(e.target.value.replace(/\D/g, ''))} onFocus={() => setAddFocused('a')} onBlur={() => setAddFocused(null)} placeholder="0" inputMode="numeric" style={inp('a')} />
            </div>
            <div>
              <div style={{ fontSize: '11px', color: '#666666', fontWeight: 700, marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Дата</div>
              <input type="date" value={nDate} onChange={e => setNDate(e.target.value)} onFocus={() => setAddFocused('d')} onBlur={() => setAddFocused(null)} style={inp('d')} />
            </div>
            <div>
              <div style={{ fontSize: '11px', color: '#666666', fontWeight: 700, marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Категория</div>
              <input value={nCategory} onChange={e => setNCategory(e.target.value)} onFocus={() => setAddFocused('c')} onBlur={() => setAddFocused(null)} placeholder="Категория" style={inp('c')} />
            </div>
            <div>
              <div style={{ fontSize: '11px', color: '#666666', fontWeight: 700, marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Счёт</div>
              <select value={nAccountId} onChange={e => setNAccountId(e.target.value === '' ? '' : Number(e.target.value))} onFocus={() => setAddFocused('ac')} onBlur={() => setAddFocused(null)} style={inp('ac')}>
                <option value="">Без счёта</option>
                {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '10px', paddingTop: '14px', borderTop: '1px solid rgba(26,26,26,0.05)' }}>
            <button onClick={handleCreate} disabled={!nTitle.trim() || saving} style={{ padding: '10px 20px', background: (nTitle.trim() && !saving) ? '#F9A08B' : 'rgba(26,26,26,0.06)', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 700, color: '#FFFFFF', cursor: (nTitle.trim() && !saving) ? 'pointer' : 'not-allowed', transition: 'all 0.2s' }}>{saving ? 'Сохранение…' : 'Создать'}</button>
            <button onClick={() => { setAddOpen(false); resetForm(); }} style={{ padding: '10px 16px', background: 'transparent', border: '1.5px solid rgba(26,26,26,0.08)', borderRadius: '8px', fontSize: '13px', fontWeight: 700, color: '#666666', cursor: 'pointer' }}>Отмена</button>
          </div>
        </div>
      )}

      {/* 3. Список операций */}
      {loading ? (
        <div style={{ background: '#FFFFFF', borderRadius: '16px', padding: '64px 20px', textAlign: 'center', color: '#999999', fontSize: '14px', fontWeight: 600, border: '1px solid rgba(26,26,26,0.06)' }}>Загрузка операций…</div>
      ) : operations.length === 0 ? (
        <div style={{ background: '#FFFFFF', borderRadius: '16px', padding: '64px 20px', textAlign: 'center', border: '1px dashed rgba(26,26,26,0.1)' }}>
          <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'rgba(26,26,26,0.03)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', color: '#999999' }}><Ico.Search /></div>
          <div style={{ fontSize: '16px', fontWeight: 800, color: '#1A1A1A', marginBottom: '6px' }}>Операции не найдены</div>
          <div style={{ fontSize: '13px', color: '#666666' }}>Измените фильтры или создайте первую операцию</div>
        </div>
      ) : (
        <>
          <div style={{ background: '#FFFFFF', borderRadius: '16px', border: '1px solid rgba(26,26,26,0.12)', boxShadow: '0 12px 32px -4px rgba(26,26,26,0.02)', overflow: 'hidden' }}>
            {operations.map((op, i) => {
              const isIncome = op.type === 'in';
              const color = isIncome ? '#5BAB72' : '#D88C9A';
              const bgLight = isIncome ? 'rgba(163,201,168,0.12)' : 'rgba(216,140,154,0.12)';
              const isOpen = expanded === op.id;
              const acc = accountName(op.account_id);

              return (
                <div key={op.id} style={{ borderBottom: i < operations.length - 1 ? '1px solid rgba(26,26,26,0.12)' : 'none' }}>
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
                      <div style={{ fontSize: '12px', color: '#666666' }}>{acc || op.category || '—'}</div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0, paddingRight: '12px' }}>
                      <div style={{ fontSize: '15px', fontWeight: 800, color, letterSpacing: '-0.3px' }}>{isIncome ? '+' : '−'}{fmt(op.amount)}</div>
                      <div style={{ fontSize: '11px', color: '#999999', marginTop: '3px', fontWeight: 500 }}>{op.op_date}</div>
                    </div>
                    <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: isOpen ? 'rgba(26,26,26,0.06)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999', transition: 'all 0.2s', transform: isOpen ? 'rotate(90deg)' : 'none', flexShrink: 0 }}>
                      <Ico.Chevron />
                    </div>
                  </div>

                  {isOpen && (
                    <div style={{ borderTop: '1px solid rgba(252,174,145,0.1)' }}>
                      <div key="view" className={styles.morphContainer} style={{ padding: '20px 24px', background: 'rgba(252,174,145,0.03)', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '24px' }}>
                        {[['Счёт поступления', acc || '—'], ['Категория', op.category ?? '—'], ['Метод оплаты', op.method ?? '—']].map(([l, v]) => (
                          <div key={l as string}>
                            <div style={{ fontSize: '11px', color: '#666666', fontWeight: 700, marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.4px' }}>{l}</div>
                            <div style={{ fontSize: '14px', fontWeight: 700, color: '#1A1A1A' }}>{v}</div>
                          </div>
                        ))}
                        <div style={{ gridColumn: '1 / -1', display: 'flex', gap: '10px', paddingTop: '16px', borderTop: '1px solid rgba(26,26,26,0.05)', marginTop: '-4px' }}>
                          <button onClick={() => showToast('Квитанция скачана', 'success')} style={{ padding: '8px 16px', background: '#FFFFFF', border: '1px solid rgba(26,26,26,0.08)', borderRadius: '8px', fontSize: '12px', fontWeight: 700, color: '#1A1A1A', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', transition: 'all 0.2s', boxShadow: '0 2px 6px rgba(0,0,0,0.02)' }} onMouseEnter={e => { e.currentTarget.style.borderColor = '#F9A08B'; e.currentTarget.style.color = '#F9A08B'; }} onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(26,26,26,0.08)'; e.currentTarget.style.color = '#1A1A1A'; }}><Ico.Doc /> Квитанция</button>
                          <button onClick={() => handleDelete(op.id)} style={{ padding: '8px 16px', background: 'transparent', border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: 700, color: '#D88C9A', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', transition: 'all 0.2s', marginLeft: 'auto' }} onMouseEnter={e => { e.currentTarget.style.background = '#FFF5F5'; }} onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}><Ico.Trash /> Удалить</button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {operations.length < total && (
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: '20px' }}>
              <button onClick={loadMore} disabled={loadingMore} style={{ padding: '12px 28px', background: '#FFFFFF', border: '1.5px solid rgba(26,26,26,0.1)', borderRadius: '12px', fontSize: '13px', fontWeight: 700, color: '#1A1A1A', cursor: loadingMore ? 'default' : 'pointer', transition: 'all 0.2s' }} onMouseEnter={e => { if (!loadingMore) e.currentTarget.style.borderColor = '#F9A08B'; }} onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(26,26,26,0.1)'; }}>
                {loadingMore ? 'Загрузка…' : `Загрузить ещё (${total - operations.length})`}
              </button>
            </div>
          )}
        </>
      )}
    </>
  );
}
