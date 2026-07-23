import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ToastType } from '../../types';
import { Ico } from '../ui/FinanceIcons';
import { InfoHint } from '../../../../../components/ui/InfoHint';
import styles from '../../Finances.module.css';
import { useStudioCurrency } from '../../../../../hooks/useStudioCurrency';
import { getCurrencySymbol } from '../../../../../components/UI';
import { useQuery } from '@tanstack/react-query';
import { useAccounts, useCounterparties, useOperations, useFinanceMutations } from '../../hooks/useFinances';
import { PAYMENT_METHOD_KEYS } from '../../constants';
import { financesApi } from '../../../../../api/finances/finances.api';
import { clientsApi } from '../../../../../api/clients/clients.api';

const PAGE_SIZE = 20;
const todayISO = () => new Date().toISOString().slice(0, 10);

// value остаётся серверным (бэк хранит "Юр. лицо"/"ИП"/"Физ. лицо" строкой) — label переводится
// тем же ключом, что в CounterpartiesTab (counterparties.types.*.label).
const TYPE_OPTIONS = [
  { value: 'Юр. лицо', key: 'legal' as const },
  { value: 'ИП', key: 'ie' as const },
  { value: 'Физ. лицо', key: 'person' as const },
];

export default function OperationsTab({ showToast, initialSearch }: {
  showToast: (msg: string, t?: ToastType) => void;
  initialSearch: string;
}) {
  const { t } = useTranslation('finances');
  const currency = getCurrencySymbol(useStudioCurrency());
  const fmt = (n: number) => `${currency}${n.toLocaleString('ru-RU')}`;

  const [search, setSearch] = useState(initialSearch || '');
  const [debouncedSearch, setDebouncedSearch] = useState(initialSearch || '');
  const [filter, setFilter] = useState<'all' | 'in' | 'out'>('all');
  const [expanded, setExpanded] = useState<number | null>(null);
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [limit, setLimit] = useState(PAGE_SIZE);

  // Дебаунс поиска: ждём паузу после последней буквы, а не шлём запрос на каждый символ.
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Сброс пагинации/раскрытой строки при смене фильтра или поискового запроса — во время рендера
  // (не в эффекте), чтобы не тратить лишний цикл рендера на смену limit/expanded.
  const [prevQueryKey, setPrevQueryKey] = useState(`${filter}|${debouncedSearch}`);
  const queryKey = `${filter}|${debouncedSearch}`;
  if (queryKey !== prevQueryKey) {
    setPrevQueryKey(queryKey);
    if (limit !== PAGE_SIZE) setLimit(PAGE_SIZE);
    if (expanded !== null) setExpanded(null);
  }

  const { data: page, isLoading: loading, isFetching: loadingMore, error } = useOperations({
    type: filter === 'all' ? undefined : filter,
    search: debouncedSearch || undefined,
    offset: 0,
    limit,
  });
  const operations = page?.items ?? [];
  const total = page?.total ?? 0;

  useEffect(() => {
    if (error) showToast(t('operations.toasts.loadFailed'), 'error');
  }, [error, showToast, t]);

  const { data: accounts = [] } = useAccounts();
  const { data: counterparties = [] } = useCounterparties();
  const { createOperation, updateOperation, deleteOperation, createCounterparty } = useFinanceMutations();

  // Правка операции (inline, по образцу GoalsTab)
  const [editingOpId, setEditingOpId] = useState<number | null>(null);
  const [eTitle, setETitle] = useState('');
  const [eAmount, setEAmount] = useState('');
  const [eCategory, setECategory] = useState('');
  const [eAccountId, setEAccountId] = useState<number | ''>('');
  const [eCounterpartyId, setECounterpartyId] = useState<number | ''>('');
  const [eMethod, setEMethod] = useState('');
  const [eDate, setEDate] = useState(todayISO());
  const [eFocused, setEFocused] = useState<string | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

  // Форма создания
  const [addOpen, setAddOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [nType, setNType] = useState<'in' | 'out'>('in');
  const [nTitle, setNTitle] = useState('');
  const [nAmount, setNAmount] = useState('');
  const [nCategory, setNCategory] = useState('');
  const [nAccountId, setNAccountId] = useState<number | ''>('');
  const [nCounterpartyId, setNCounterpartyId] = useState<number | ''>('');
  const [nMethod, setNMethod] = useState('');
  const [nDate, setNDate] = useState(todayISO());
  const [addFocused, setAddFocused] = useState<string | null>(null);

  // Клиент операции (V5-8, Блок 3, Вариант A): только для дохода — начисляет
  // баллы/уровень лояльности через accrue_points/register_purchase на бэке.
  const [nClientId, setNClientId] = useState<number | null>(null);
  const [nClientQuery, setNClientQuery] = useState('');
  const { data: clientResults } = useQuery({
    queryKey: ['clients', 'search', nClientQuery],
    queryFn: () => clientsApi.getList({ search: nClientQuery, limit: 5 }),
    enabled: nClientQuery.trim().length >= 2 && nClientId === null,
  });

  // Мини-форма "+ Новый контрагент" прямо в форме операции
  const [newCpOpen, setNewCpOpen] = useState(false);
  const [newCpName, setNewCpName] = useState('');
  const [newCpType, setNewCpType] = useState(TYPE_OPTIONS[0].value);
  const [savingCp, setSavingCp] = useState(false);

  const accountName = useCallback(
    (id: number | null) => accounts.find(a => a.id === id)?.name ?? '',
    [accounts],
  );
  const counterpartyName = useCallback(
    (id: number | null) => counterparties.find(c => c.id === id)?.name ?? '',
    [counterparties],
  );

  const loadMore = () => setLimit(prev => prev + PAGE_SIZE);

  const openOpEdit = (op: (typeof operations)[number]) => {
    setEditingOpId(op.id);
    setETitle(op.title);
    setEAmount(String(op.amount));
    setECategory(op.category ?? '');
    setEAccountId(op.account_id ?? '');
    setECounterpartyId(op.counterparty_id ?? '');
    setEMethod(op.method ?? '');
    setEDate(op.op_date);
  };

  const saveOpEdit = async () => {
    if (editingOpId === null || !eTitle.trim() || savingEdit) return;
    const amount = parseInt(eAmount) || 0;
    if (amount <= 0) { showToast(t('operations.toasts.enterAmount'), 'error'); return; }
    setSavingEdit(true);
    try {
      await updateOperation(editingOpId, {
        title: eTitle.trim(),
        amount,
        op_date: eDate,
        category: eCategory.trim() || null,
        account_id: eAccountId === '' ? null : eAccountId,
        counterparty_id: eCounterpartyId === '' ? null : eCounterpartyId,
        method: eMethod || null,
      });
      setEditingOpId(null);
      showToast(t('operations.toasts.updated'), 'success');
    } catch {
      // тост уже показан в useFinanceMutations
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteOperation(id);
      setExpanded(null);
      showToast(t('operations.toasts.deleted'), 'error');
    } catch {
      // тост с текстом ошибки сервера уже показан в useFinanceMutations
    }
  };

  const resetForm = () => {
    setNType('in'); setNTitle(''); setNAmount(''); setNCategory('');
    setNAccountId(''); setNCounterpartyId(''); setNMethod(''); setNDate(todayISO());
    setNewCpOpen(false); setNewCpName(''); setNewCpType(TYPE_OPTIONS[0].value);
    setNClientId(null); setNClientQuery('');
  };

  const handleCreateCounterparty = async () => {
    if (!newCpName.trim() || savingCp) return;
    setSavingCp(true);
    try {
      const cp = await createCounterparty({ name: newCpName.trim(), counterparty_type: newCpType });
      setNCounterpartyId(cp.id);
      setNewCpOpen(false);
      setNewCpName('');
    } catch {
      // тост уже показан в useFinanceMutations
    } finally {
      setSavingCp(false);
    }
  };

  const handleCreate = async () => {
    if (!nTitle.trim() || saving) return;
    const amount = parseInt(nAmount) || 0;
    if (amount <= 0) { showToast(t('operations.toasts.enterAmount'), 'error'); return; }
    setSaving(true);
    try {
      await createOperation({
        type: nType,
        title: nTitle.trim(),
        amount,
        op_date: nDate,
        category: nCategory.trim() || undefined,
        account_id: nAccountId === '' ? undefined : nAccountId,
        counterparty_id: nCounterpartyId === '' ? undefined : nCounterpartyId,
        method: nMethod || undefined,
        client_id: nType === 'in' ? (nClientId ?? undefined) : undefined,
      });
      resetForm();
      setAddOpen(false);
      setLimit(PAGE_SIZE);   // новая операция сверху — первая страница уже инвалидирована
      showToast(t('operations.toasts.created'), 'success');
    } catch {
      // тост уже показан в useFinanceMutations
    } finally {
      setSaving(false);
    }
  };

  const [exporting, setExporting] = useState(false);
  const handleExport = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      await financesApi.exportOperations({
        type: filter === 'all' ? undefined : filter,
        search: debouncedSearch || undefined,
      });
    } catch {
      showToast(t('operations.toasts.exportFailed'), 'error');
    } finally {
      setExporting(false);
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
  const einp = (key: string): React.CSSProperties => ({
    width: '100%', padding: '10px 12px', background: '#FDFCFB',
    border: eFocused === key ? '1.5px solid #F9A08B' : '1.5px solid rgba(26,26,26,0.08)',
    borderRadius: '8px', fontSize: '13px', fontWeight: 600, color: '#1A1A1A', outline: 'none',
    boxShadow: eFocused === key ? '0 0 0 3px rgba(249,160,139,0.12)' : 'none',
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
            <div style={{ fontSize: '12px', color: '#666666', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px' }}>{t('operations.income')}</div>
          </div>
          <div style={{ fontSize: '32px', fontWeight: 800, color: '#1A1A1A', letterSpacing: '-1px' }}>
            <span style={{ color: '#5BAB72', marginRight: '4px' }}>+</span>{fmt(totalIncome)}
          </div>
        </div>

        <div style={{ background: '#FFFFFF', borderRadius: '16px', padding: '24px', border: '1px solid rgba(26,26,26,0.04)', boxShadow: '0 12px 32px -4px rgba(26,26,26,0.02)', position: 'relative', overflow: 'hidden', transition: 'transform 0.2s', cursor: 'default' }} onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'} onMouseLeave={e => e.currentTarget.style.transform = 'none'}>
          <div style={{ position: 'absolute', top: '-20px', right: '-20px', width: '100px', height: '100px', background: 'radial-gradient(circle, rgba(216,140,154,0.12) 0%, transparent 70%)', borderRadius: '50%' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '12px', background: 'rgba(216,140,154,0.12)', color: '#D88C9A', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Ico.Down /></div>
            <div style={{ fontSize: '12px', color: '#666666', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px' }}>{t('operations.expense')}</div>
          </div>
          <div style={{ fontSize: '32px', fontWeight: 800, color: '#1A1A1A', letterSpacing: '-1px' }}>
            <span style={{ color: '#D88C9A', marginRight: '4px' }}>−</span>{fmt(totalExpense)}
          </div>
        </div>

        <div style={{ background: '#FFFFFF', borderRadius: '16px', padding: '24px', border: '1px solid rgba(26,26,26,0.04)', boxShadow: '0 12px 32px -4px rgba(26,26,26,0.02)', position: 'relative', overflow: 'hidden', transition: 'transform 0.2s', cursor: 'default' }} onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'} onMouseLeave={e => e.currentTarget.style.transform = 'none'}>
          <div style={{ position: 'absolute', top: '-20px', right: '-20px', width: '100px', height: '100px', background: 'radial-gradient(circle, rgba(249,160,139,0.15) 0%, transparent 70%)', borderRadius: '50%' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '12px', background: 'rgba(249,160,139,0.12)', color: '#F9A08B', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Ico.Dollar /></div>
            <div style={{ fontSize: '12px', color: '#666666', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px' }}>{t('operations.balance')}</div>
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
          <input type="text" placeholder={t('operations.searchPlaceholder')} value={search} onChange={e => setSearch(e.target.value)} onFocus={() => setIsSearchFocused(true)} onBlur={() => setIsSearchFocused(false)} style={{ width: '100%', height: '48px', paddingLeft: '44px', paddingRight: search ? '40px' : '16px', background: '#FDFCFB', border: isSearchFocused ? '1.5px solid #F9A08B' : '1.5px solid rgba(26,26,26,0.06)', borderRadius: '12px', fontSize: '14px', fontWeight: 500, color: '#1A1A1A', outline: 'none', boxShadow: isSearchFocused ? '0 0 0 3px rgba(249, 160, 139, 0.12)' : 'none', transition: 'all 0.25s cubic-bezier(0.2, 0.8, 0.2, 1)', boxSizing: 'border-box', fontFamily: "'Manrope', sans-serif" }} />
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
                {f === 'all' ? t('common.all') : f === 'in' ? t('operations.income') : t('operations.expense')}
              </button>
            );
          })}
        </div>

        <button onClick={() => setAddOpen(o => !o)} style={{ display: 'flex', alignItems: 'center', gap: '8px', height: '40px', padding: '0 18px', background: addOpen ? 'rgba(249,160,139,0.08)' : '#F9A08B', border: addOpen ? '1.5px solid #F9A08B' : 'none', borderRadius: '10px', color: addOpen ? '#F9A08B' : '#FFFFFF', fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: "'Manrope', sans-serif", transition: 'all 0.2s', flexShrink: 0 }}>
          <Ico.Plus /> {addOpen ? t('operations.close') : t('operations.operation')}
        </button>

        <button onClick={handleExport} disabled={exporting} style={{ display: 'flex', alignItems: 'center', gap: '8px', height: '40px', padding: '0 16px', background: 'transparent', border: '1.5px solid rgba(26,26,26,0.08)', borderRadius: '10px', color: '#666666', fontSize: '13px', fontWeight: 600, cursor: exporting ? 'default' : 'pointer', opacity: exporting ? 0.6 : 1, fontFamily: "'Manrope', sans-serif", transition: 'all 0.2s cubic-bezier(0.2, 0.8, 0.2, 1)', flexShrink: 0 }} onMouseEnter={e => { if (exporting) return; e.currentTarget.style.background = 'rgba(26,26,26,0.03)'; e.currentTarget.style.color = '#1A1A1A'; e.currentTarget.style.borderColor = 'rgba(26,26,26,0.15)'; }} onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#666666'; e.currentTarget.style.borderColor = 'rgba(26,26,26,0.08)'; }}>
          <Ico.Download /> {exporting ? t('common.loading') : t('operations.export')}
        </button>

        <InfoHint title={t('tabs.operations')} text={t('info.operations')} side="left" />
      </div>

      {/* Форма создания операции */}
      {addOpen && (
        <div className={styles.morphContainer} style={{ background: '#FFFFFF', borderRadius: '16px', border: '1.5px solid #F9A08B', padding: '24px', marginBottom: '24px', boxShadow: '0 12px 28px rgba(249,160,139,0.06)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '18px' }}>
            <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(249,160,139,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#F9A08B' }}><Ico.Plus /></div>
            <div style={{ fontSize: '13px', fontWeight: 800, color: '#1A1A1A' }}>{t('operations.newOperationTitle')}</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
            <div style={{ display: 'flex', gap: '6px', gridColumn: '1 / -1' }}>
              {(['in', 'out'] as const).map(opType => (
                <button key={opType} type="button" onClick={() => setNType(opType)} style={{ flex: 1, padding: '10px', background: nType === opType ? (opType === 'in' ? 'rgba(163,201,168,0.12)' : 'rgba(216,140,154,0.12)') : '#FDFCFB', border: nType === opType ? `1.5px solid ${opType === 'in' ? '#5BAB72' : '#D88C9A'}` : '1.5px solid rgba(26,26,26,0.08)', borderRadius: '8px', fontSize: '13px', fontWeight: 700, color: nType === opType ? (opType === 'in' ? '#5BAB72' : '#D88C9A') : '#666666', cursor: 'pointer', transition: 'all 0.15s' }}>
                  {opType === 'in' ? t('operations.income') : t('operations.expense')}
                </button>
              ))}
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <div style={{ fontSize: '11px', color: '#666666', fontWeight: 700, marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.4px' }}>{t('operations.titleLabel')}</div>
              <input value={nTitle} onChange={e => setNTitle(e.target.value)} onFocus={() => setAddFocused('t')} onBlur={() => setAddFocused(null)} placeholder={t('operations.titlePlaceholder')} style={inp('t')} />
            </div>
            {nType === 'in' && (
              <div style={{ gridColumn: '1 / -1', position: 'relative' }}>
                <div style={{ fontSize: '11px', color: '#666666', fontWeight: 700, marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.4px' }}>{t('operations.clientLabel')}</div>
                {nClientId ? (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', background: 'rgba(249,160,139,0.06)', border: '1.5px solid #F9A08B', borderRadius: '8px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: '#1A1A1A' }}>{nClientQuery}</span>
                    <button type="button" onClick={() => { setNClientId(null); setNClientQuery(''); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#666666', display: 'flex' }}>
                      <Ico.X />
                    </button>
                  </div>
                ) : (
                  <input value={nClientQuery} onChange={e => setNClientQuery(e.target.value)} onFocus={() => setAddFocused('cl')} onBlur={() => setAddFocused(null)} placeholder={t('operations.clientSearchPlaceholder')} style={inp('cl')} />
                )}
                {!nClientId && clientResults && clientResults.items.length > 0 && (
                  <div style={{ position: 'absolute', zIndex: 5, top: '100%', left: 0, right: 0, marginTop: '4px', borderRadius: '8px', border: '1px solid rgba(26,26,26,0.08)', background: '#FFFFFF', boxShadow: '0 8px 24px rgba(0,0,0,0.08)', overflow: 'hidden' }}>
                    {clientResults.items.map(c => {
                      const name = c.last_name ? `${c.name} ${c.last_name}` : c.name;
                      return (
                        <button key={c.id} type="button" onClick={() => { setNClientId(c.id); setNClientQuery(name); }} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 12px', background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px', color: '#1A1A1A' }}>
                          {name}
                        </button>
                      );
                    })}
                  </div>
                )}
                <div style={{ fontSize: '11px', color: '#999999', marginTop: '6px' }}>{t('operations.clientHint')}</div>
              </div>
            )}
            <div>
              <div style={{ fontSize: '11px', color: '#666666', fontWeight: 700, marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.4px' }}>{t('operations.amountLabel', { symbol: currency })}</div>
              <input value={nAmount} onChange={e => setNAmount(e.target.value.replace(/\D/g, ''))} onFocus={() => setAddFocused('a')} onBlur={() => setAddFocused(null)} placeholder="0" inputMode="numeric" style={inp('a')} />
            </div>
            <div>
              <div style={{ fontSize: '11px', color: '#666666', fontWeight: 700, marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.4px' }}>{t('operations.dateLabel')}</div>
              <input type="date" value={nDate} onChange={e => setNDate(e.target.value)} onFocus={() => setAddFocused('d')} onBlur={() => setAddFocused(null)} style={inp('d')} />
            </div>
            <div>
              <div style={{ fontSize: '11px', color: '#666666', fontWeight: 700, marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.4px' }}>{t('operations.categoryLabel')}</div>
              <input value={nCategory} onChange={e => setNCategory(e.target.value)} onFocus={() => setAddFocused('c')} onBlur={() => setAddFocused(null)} placeholder={t('operations.categoryPlaceholder')} style={inp('c')} />
            </div>
            <div>
              <div style={{ fontSize: '11px', color: '#666666', fontWeight: 700, marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.4px' }}>{t('operations.accountLabel')}</div>
              <select value={nAccountId} onChange={e => setNAccountId(e.target.value === '' ? '' : Number(e.target.value))} onFocus={() => setAddFocused('ac')} onBlur={() => setAddFocused(null)} style={inp('ac')}>
                <option value="">{t('operations.noAccount')}</option>
                {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            <div>
              <div style={{ fontSize: '11px', color: '#666666', fontWeight: 700, marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.4px' }}>{t('operations.methodLabel')}</div>
              <select value={nMethod} onChange={e => setNMethod(e.target.value)} onFocus={() => setAddFocused('m')} onBlur={() => setAddFocused(null)} style={inp('m')}>
                <option value="">{t('operations.noMethod')}</option>
                {PAYMENT_METHOD_KEYS.map(key => <option key={key} value={key}>{t(`paymentMethods.methods.${key}.name`)}</option>)}
              </select>
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <div style={{ fontSize: '11px', color: '#666666', fontWeight: 700, marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.4px' }}>{t('operations.counterpartyLabel')}</div>
              <select
                value={newCpOpen ? '__new__' : nCounterpartyId}
                onChange={e => {
                  if (e.target.value === '__new__') { setNewCpOpen(true); return; }
                  setNCounterpartyId(e.target.value === '' ? '' : Number(e.target.value));
                }}
                onFocus={() => setAddFocused('cp')} onBlur={() => setAddFocused(null)}
                style={inp('cp')}
              >
                <option value="">{t('operations.noCounterparty')}</option>
                <option value="__new__">{t('operations.newCounterparty')}</option>
                {counterparties.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            {newCpOpen && (
              <div className={styles.morphContainer} style={{ gridColumn: '1 / -1', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', padding: '14px', background: 'rgba(249,160,139,0.04)', borderRadius: '10px', border: '1px dashed rgba(249,160,139,0.4)' }}>
                <input value={newCpName} onChange={e => setNewCpName(e.target.value)} onFocus={() => setAddFocused('cpn')} onBlur={() => setAddFocused(null)} placeholder={t('counterparties.namePlaceholder')} style={inp('cpn')} />
                <select value={newCpType} onChange={e => setNewCpType(e.target.value)} onFocus={() => setAddFocused('cpt')} onBlur={() => setAddFocused(null)} style={inp('cpt')}>
                  {TYPE_OPTIONS.map(o => <option key={o.key} value={o.value}>{t(`counterparties.types.${o.key}.label`)}</option>)}
                </select>
                <div style={{ gridColumn: '1 / -1', display: 'flex', gap: '8px' }}>
                  <button type="button" onClick={handleCreateCounterparty} disabled={!newCpName.trim() || savingCp} style={{ padding: '8px 14px', background: (newCpName.trim() && !savingCp) ? '#F9A08B' : 'rgba(26,26,26,0.06)', border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: 700, color: '#FFFFFF', cursor: (newCpName.trim() && !savingCp) ? 'pointer' : 'not-allowed' }}>{savingCp ? t('operations.saving') : t('common.create')}</button>
                  <button type="button" onClick={() => { setNewCpOpen(false); setNewCpName(''); }} style={{ padding: '8px 14px', background: 'transparent', border: '1.5px solid rgba(26,26,26,0.08)', borderRadius: '8px', fontSize: '12px', fontWeight: 700, color: '#666666', cursor: 'pointer' }}>{t('common.cancel')}</button>
                </div>
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: '10px', paddingTop: '14px', borderTop: '1px solid rgba(26,26,26,0.05)' }}>
            <button onClick={handleCreate} disabled={!nTitle.trim() || saving} style={{ padding: '10px 20px', background: (nTitle.trim() && !saving) ? '#F9A08B' : 'rgba(26,26,26,0.06)', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 700, color: '#FFFFFF', cursor: (nTitle.trim() && !saving) ? 'pointer' : 'not-allowed', transition: 'all 0.2s' }}>{saving ? t('operations.saving') : t('common.create')}</button>
            <button onClick={() => { setAddOpen(false); resetForm(); }} style={{ padding: '10px 16px', background: 'transparent', border: '1.5px solid rgba(26,26,26,0.08)', borderRadius: '8px', fontSize: '13px', fontWeight: 700, color: '#666666', cursor: 'pointer' }}>{t('common.cancel')}</button>
          </div>
        </div>
      )}

      {/* 3. Список операций */}
      {loading ? (
        <div style={{ background: '#FFFFFF', borderRadius: '16px', padding: '64px 20px', textAlign: 'center', color: '#999999', fontSize: '14px', fontWeight: 600, border: '1px solid rgba(26,26,26,0.06)' }}>{t('operations.loading')}</div>
      ) : operations.length === 0 ? (
        <div style={{ background: '#FFFFFF', borderRadius: '16px', padding: '64px 20px', textAlign: 'center', border: '1px dashed rgba(26,26,26,0.1)' }}>
          <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'rgba(26,26,26,0.03)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', color: '#999999' }}><Ico.Search /></div>
          <div style={{ fontSize: '16px', fontWeight: 800, color: '#1A1A1A', marginBottom: '6px' }}>{t('operations.emptyTitle')}</div>
          <div style={{ fontSize: '13px', color: '#666666' }}>{t('operations.emptyBody')}</div>
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
              const cp = counterpartyName(op.counterparty_id);

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
                          <span style={{ fontSize: '10px', background: '#FFF3CD', color: '#856404', padding: '2px 8px', borderRadius: '20px', fontWeight: 700 }}>{t('operations.pending')}</span>
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
                      {editingOpId === op.id ? (
                        <div key="edit" className={styles.morphContainer} style={{ padding: '20px 24px', background: 'rgba(252,174,145,0.03)' }}>
                          <div style={{ fontSize: '13px', fontWeight: 800, color: '#1A1A1A', marginBottom: '14px' }}>{t('operations.editTitle')}</div>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
                            <div style={{ gridColumn: '1 / -1' }}>
                              <div style={{ fontSize: '11px', color: '#666666', fontWeight: 700, marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.4px' }}>{t('operations.titleLabel')}</div>
                              <input value={eTitle} onChange={e => setETitle(e.target.value)} onFocus={() => setEFocused('et')} onBlur={() => setEFocused(null)} style={einp('et')} />
                            </div>
                            <div>
                              <div style={{ fontSize: '11px', color: '#666666', fontWeight: 700, marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.4px' }}>{t('operations.amountLabel', { symbol: currency })}</div>
                              <input value={eAmount} onChange={e => setEAmount(e.target.value.replace(/\D/g, ''))} onFocus={() => setEFocused('ea')} onBlur={() => setEFocused(null)} inputMode="numeric" style={einp('ea')} />
                            </div>
                            <div>
                              <div style={{ fontSize: '11px', color: '#666666', fontWeight: 700, marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.4px' }}>{t('operations.dateLabel')}</div>
                              <input type="date" value={eDate} onChange={e => setEDate(e.target.value)} onFocus={() => setEFocused('ed')} onBlur={() => setEFocused(null)} style={einp('ed')} />
                            </div>
                            <div>
                              <div style={{ fontSize: '11px', color: '#666666', fontWeight: 700, marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.4px' }}>{t('operations.categoryLabel')}</div>
                              <input value={eCategory} onChange={e => setECategory(e.target.value)} onFocus={() => setEFocused('ec')} onBlur={() => setEFocused(null)} style={einp('ec')} />
                            </div>
                            <div>
                              <div style={{ fontSize: '11px', color: '#666666', fontWeight: 700, marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.4px' }}>{t('operations.accountLabel')}</div>
                              <select value={eAccountId} onChange={e => setEAccountId(e.target.value === '' ? '' : Number(e.target.value))} onFocus={() => setEFocused('eac')} onBlur={() => setEFocused(null)} style={einp('eac')}>
                                <option value="">{t('operations.noAccount')}</option>
                                {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                              </select>
                            </div>
                            <div>
                              <div style={{ fontSize: '11px', color: '#666666', fontWeight: 700, marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.4px' }}>{t('operations.methodLabel')}</div>
                              <select value={eMethod} onChange={e => setEMethod(e.target.value)} onFocus={() => setEFocused('em')} onBlur={() => setEFocused(null)} style={einp('em')}>
                                <option value="">{t('operations.noMethod')}</option>
                                {PAYMENT_METHOD_KEYS.map(key => <option key={key} value={key}>{t(`paymentMethods.methods.${key}.name`)}</option>)}
                              </select>
                            </div>
                            <div>
                              <div style={{ fontSize: '11px', color: '#666666', fontWeight: 700, marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.4px' }}>{t('operations.counterpartyLabel')}</div>
                              <select value={eCounterpartyId} onChange={e => setECounterpartyId(e.target.value === '' ? '' : Number(e.target.value))} onFocus={() => setEFocused('ecp')} onBlur={() => setEFocused(null)} style={einp('ecp')}>
                                <option value="">{t('operations.noCounterparty')}</option>
                                {counterparties.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                              </select>
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: '10px', paddingTop: '14px', borderTop: '1px solid rgba(26,26,26,0.05)' }}>
                            <button onClick={saveOpEdit} disabled={!eTitle.trim() || savingEdit} style={{ padding: '10px 20px', background: (eTitle.trim() && !savingEdit) ? '#F9A08B' : 'rgba(26,26,26,0.06)', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 700, color: '#FFFFFF', cursor: (eTitle.trim() && !savingEdit) ? 'pointer' : 'not-allowed', transition: 'all 0.2s' }}>{savingEdit ? t('operations.saving') : t('common.save')}</button>
                            <button onClick={() => setEditingOpId(null)} style={{ padding: '10px 16px', background: 'transparent', border: '1.5px solid rgba(26,26,26,0.08)', borderRadius: '8px', fontSize: '13px', fontWeight: 700, color: '#666666', cursor: 'pointer' }}>{t('common.cancel')}</button>
                          </div>
                        </div>
                      ) : (
                        <div key="view" className={styles.morphContainer} style={{ padding: '20px 24px', background: 'rgba(252,174,145,0.03)', display: 'grid', gridTemplateColumns: cp ? '1fr 1fr 1fr 1fr' : '1fr 1fr 1fr', gap: '24px' }}>
                          {[[t('operations.detailAccount'), acc || '—'], [t('operations.detailCategory'), op.category ?? '—'], [t('operations.detailMethod'), op.method ? t(`paymentMethods.methods.${op.method}.name`, op.method) : '—'], ...(cp ? [[t('operations.detailCounterparty'), cp]] : [])].map(([l, v]) => (
                            <div key={l as string}>
                              <div style={{ fontSize: '11px', color: '#666666', fontWeight: 700, marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.4px' }}>{l}</div>
                              <div style={{ fontSize: '14px', fontWeight: 700, color: '#1A1A1A' }}>{v}</div>
                            </div>
                          ))}
                          <div style={{ gridColumn: '1 / -1', display: 'flex', gap: '10px', paddingTop: '16px', borderTop: '1px solid rgba(26,26,26,0.05)', marginTop: '-4px' }}>
                            <button onClick={() => showToast(t('operations.toasts.receiptDownloaded'), 'success')} style={{ padding: '8px 16px', background: '#FFFFFF', border: '1px solid rgba(26,26,26,0.08)', borderRadius: '8px', fontSize: '12px', fontWeight: 700, color: '#1A1A1A', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', transition: 'all 0.2s', boxShadow: '0 2px 6px rgba(0,0,0,0.02)' }} onMouseEnter={e => { e.currentTarget.style.borderColor = '#F9A08B'; e.currentTarget.style.color = '#F9A08B'; }} onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(26,26,26,0.08)'; e.currentTarget.style.color = '#1A1A1A'; }}><Ico.Doc /> {t('operations.receipt')}</button>
                            <button onClick={() => openOpEdit(op)} style={{ padding: '8px 16px', background: '#FFFFFF', border: '1px solid rgba(26,26,26,0.08)', borderRadius: '8px', fontSize: '12px', fontWeight: 700, color: '#1A1A1A', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', transition: 'all 0.2s', boxShadow: '0 2px 6px rgba(0,0,0,0.02)' }} onMouseEnter={e => { e.currentTarget.style.borderColor = '#F9A08B'; e.currentTarget.style.color = '#F9A08B'; }} onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(26,26,26,0.08)'; e.currentTarget.style.color = '#1A1A1A'; }}><Ico.Edit /> {t('common.edit')}</button>
                            <button onClick={() => handleDelete(op.id)} style={{ padding: '8px 16px', background: 'transparent', border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: 700, color: '#D88C9A', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', transition: 'all 0.2s', marginLeft: 'auto' }} onMouseEnter={e => { e.currentTarget.style.background = '#FFF5F5'; }} onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}><Ico.Trash /> {t('common.delete')}</button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {operations.length < total && (
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: '20px' }}>
              <button onClick={loadMore} disabled={loadingMore} style={{ padding: '12px 28px', background: '#FFFFFF', border: '1.5px solid rgba(26,26,26,0.1)', borderRadius: '12px', fontSize: '13px', fontWeight: 700, color: '#1A1A1A', cursor: loadingMore ? 'default' : 'pointer', transition: 'all 0.2s' }} onMouseEnter={e => { if (!loadingMore) e.currentTarget.style.borderColor = '#F9A08B'; }} onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(26,26,26,0.1)'; }}>
                {loadingMore ? t('common.loading') : t('operations.loadMore', { count: total - operations.length })}
              </button>
            </div>
          )}
        </>
      )}
    </>
  );
}
