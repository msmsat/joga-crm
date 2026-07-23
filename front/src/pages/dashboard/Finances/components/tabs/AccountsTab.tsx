import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ToastType } from '../../types';
import { Ico } from '../ui/FinanceIcons';
import { Btn } from '../ui/Btn';
import { ConfirmModal } from '../ui/ConfirmModal';
import { InfoHint } from '../../../../../components/ui/InfoHint';
import { DonutIllustration } from '../ui/DonutIllustration';
import styles from '../../Finances.module.css';
import { useStudioCurrency } from '../../../../../hooks/useStudioCurrency';
import { getCurrencySymbol } from '../../../../../components/UI';
import { useAccounts, useFinanceMutations } from '../../hooks/useFinances';

const ACCOUNT_COLORS = ['#FCAE91', '#A3C9A8', '#7EB5D6', '#D88C9A'];

export default function AccountsTab({ showToast, onNavigateToOperations }: {
  showToast: (msg: string, t?: ToastType) => void;
  onNavigateToOperations: (accountName: string) => void;
}) {
  const { t } = useTranslation('finances');
  const currency = getCurrencySymbol(useStudioCurrency());
  const fmt = (n: number) => `${currency}${n.toLocaleString('ru-RU')}`;
  const { data: accounts = [], isLoading: loading } = useAccounts();
  const { createAccount, updateAccount, deleteAccount } = useFinanceMutations();
  const [selected, setSelected] = useState<number | null>(null);
  const [confirm, setConfirm] = useState<{ open: boolean; id: number | null }>({ open: false, id: null });

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [editBalance, setEditBalance] = useState('');
  const [editType, setEditType] = useState('cash');
  const [isEditInputFocused, setIsEditInputFocused] = useState(false);
  const [isEditBalanceFocused, setIsEditBalanceFocused] = useState(false);

  const [historyId, setHistoryId] = useState<number | null>(null);

  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newBalance, setNewBalance] = useState('');
  const [newType, setNewType] = useState('cash');
  const [saving, setSaving] = useState(false);
  const [isNewInputFocused, setIsNewInputFocused] = useState(false);
  const [isNewBalanceFocused, setIsNewBalanceFocused] = useState(false);

  const total = accounts.reduce((s, a) => s + a.balance, 0);
  const segments = total > 0 ? accounts.map(a => ({ pct: a.balance / total, color: a.color, label: a.name })) : [];

  const handleDelete = (id: number) => setConfirm({ open: true, id });

  const confirmDelete = async () => {
    const id = confirm.id;
    setConfirm({ open: false, id: null });
    if (id == null) return;
    try {
      await deleteAccount(id);
      showToast(t('accounts.toasts.deleted'), 'error');
      setSelected(null);
    } catch {
      // тост с текстом ошибки сервера уже показан в useFinanceMutations
    }
  };

  const handleUpdate = async (id: number) => {
    if (!editName.trim()) return;
    const numBalance = parseInt(editBalance) || 0;
    try {
      await updateAccount(id, { name: editName.trim(), type: editType, balance: numBalance });
      setEditingId(null);
      showToast(t('accounts.toasts.saved'), 'success');
    } catch {
      // тост уже показан в useFinanceMutations
    }
  };

  const handleSaveNew = async () => {
    if (!newName.trim() || saving) return;
    setSaving(true);
    const color = ACCOUNT_COLORS[accounts.length % ACCOUNT_COLORS.length];
    try {
      await createAccount({
        name: newName.trim(), type: newType, color, balance: parseInt(newBalance) || 0,
      });
      setNewName(''); setNewBalance(''); setNewType('cash'); setAddOpen(false);
      showToast(t('accounts.toasts.created'), 'success');
    } catch {
      // тост уже показан в useFinanceMutations
    } finally {
      setSaving(false);
    }
  };

  const handleNumberInput = (val: string, setter: (v: string) => void) => {
    setter(val.replace(/\D/g, ''));
  };

  if (loading) {
    return <div style={{ padding: '64px 20px', textAlign: 'center', color: '#999999', fontSize: '14px', fontWeight: 600 }}>{t('accounts.loading')}</div>;
  }

  return (
    <>
      <style>{`.${styles.morphContainer} { animation: cardMorph 0.3s cubic-bezier(0.2, 0.8, 0.2, 1) both; } @keyframes cardMorph { from { opacity: 0; transform: scale(0.97) translateY(6px); } to { opacity: 1; transform: scale(1) translateY(0); } }`}</style>

      {/* Hero-иллюстрация */}
      <div className="finance-illus" style={{ marginBottom: '28px', display: 'flex', alignItems: 'center', padding: '0 32px', gap: '32px' }}>
        <DonutIllustration total={total} segments={segments} centerLabel={t('accounts.donutTotal', { symbol: currency })} />
        <div style={{ flex: 1, textAlign: 'center' }}>
          <div style={{ fontSize: '11px', color: '#666666', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
            {t('accounts.totalCapital')}
            <InfoHint title={t('tabs.accounts')} text={t('info.accounts')} />
          </div>
          <div style={{ fontSize: '40px', fontWeight: 800, letterSpacing: '-2px', color: '#1A1A1A', lineHeight: 1 }}>{fmt(total)}</div>
          <div style={{ marginTop: '12px' }}>
            <span style={{ fontSize: '12px', color: '#5BAB72', fontWeight: 700, background: 'rgba(163,201,168,0.12)', padding: '5px 14px', borderRadius: '20px' }}>
              ↑ +{fmt(accounts.reduce((s, a) => s + a.daily_change, 0))} {t('accounts.todayChange')}
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', minWidth: '170px' }}>
          {accounts.map(a => (
            <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: a.color, flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '11px', fontWeight: 600, color: '#1A1A1A' }}>{a.name}</div>
                <div style={{ fontSize: '10px', color: '#666666' }}>{total > 0 ? Math.round(a.balance / total * 100) : 0}%</div>
              </div>
              <div style={{ fontSize: '12px', fontWeight: 700, color: a.color }}>{fmt(a.balance)}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Сетка карточек счетов */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '20px', marginBottom: '20px' }}>
        {accounts.map(acc => {
          const TypeIcon = acc.type === 'cash' ? Ico.Cash : acc.type === 'bank' ? Ico.Card : Ico.World;
          const isSelected = selected === acc.id;
          const isEditing = editingId === acc.id;
          const isHistory = historyId === acc.id;

          return (
            <div
              key={acc.id} className="card card-sm"
              onClick={() => { if (!isEditing && !isHistory) setSelected(isSelected ? null : acc.id); }}
              style={{
                cursor: (isEditing || isHistory) ? 'default' : 'pointer', position: 'relative', overflow: 'hidden', padding: '24px',
                border: isSelected ? `1.5px solid ${acc.color}` : '1.5px solid rgba(26, 26, 26, 0.06)', background: '#FFFFFF',
                transition: 'all 0.25s cubic-bezier(0.2, 0.8, 0.2, 1)', transform: isSelected ? 'translateY(-2px)' : 'none',
                boxShadow: isSelected ? `0 16px 32px ${acc.color}15` : '0 4px 12px rgba(26,26,26,0.02)',
              }}
            >
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '3px', background: acc.color }} />

              {isEditing ? (
                <div className={styles.morphContainer} onClick={e => e.stopPropagation()}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
                    <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(249, 160, 139, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#F9A08B' }}><Ico.Edit /></div>
                    <div style={{ fontSize: '12px', fontWeight: 800, color: '#1A1A1A' }}>{t('accounts.editTitle')}</div>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                    <input type="text" value={editName} placeholder={t('accounts.namePlaceholder')} onChange={e => setEditName(e.target.value)} onFocus={() => setIsEditInputFocused(true)} onBlur={() => setIsEditInputFocused(false)} style={{ flex: 1, padding: '10px 12px', background: '#FDFCFB', border: isEditInputFocused ? '1.5px solid #F9A08B' : '1.5px solid rgba(26,26,26,0.08)', borderRadius: '8px', fontSize: '13px', fontWeight: 600, color: '#1A1A1A', outline: 'none', boxShadow: isEditInputFocused ? '0 0 0 3px rgba(249, 160, 139, 0.12)' : 'none', transition: 'all 0.2s', minWidth: 0 }} />
                    <input type="text" value={editBalance} placeholder={t('accounts.balancePlaceholder', { symbol: currency })} onChange={e => handleNumberInput(e.target.value, setEditBalance)} onFocus={() => setIsEditBalanceFocused(true)} onBlur={() => setIsEditBalanceFocused(false)} style={{ width: '90px', padding: '10px 12px', background: '#FDFCFB', border: isEditBalanceFocused ? '1.5px solid #F9A08B' : '1.5px solid rgba(26,26,26,0.08)', borderRadius: '8px', fontSize: '13px', fontWeight: 700, color: '#1A1A1A', outline: 'none', boxShadow: isEditBalanceFocused ? '0 0 0 3px rgba(249, 160, 139, 0.12)' : 'none', transition: 'all 0.2s', textAlign: 'right' }} />
                  </div>
                  {!acc.is_system && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px', marginBottom: '16px' }}>
                      {[{ id: 'cash', icon: <Ico.Cash />, label: t('accounts.types.cash') }, { id: 'bank', icon: <Ico.Card />, label: t('accounts.types.bank') }, { id: 'online', icon: <Ico.World />, label: t('accounts.types.online') }].map(btn => (
                        <button key={btn.id} type="button" onClick={() => setEditType(btn.id)} style={{ padding: '8px 4px', background: editType === btn.id ? 'rgba(249, 160, 139, 0.05)' : '#FDFCFB', border: editType === btn.id ? '1.5px solid #F9A08B' : '1.5px solid rgba(26,26,26,0.06)', borderRadius: '8px', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', color: editType === btn.id ? '#F9A08B' : '#666666', transition: 'all 0.15s' }}>
                          {btn.icon}<span style={{ fontSize: '9px', fontWeight: 700 }}>{btn.label}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button onClick={() => handleUpdate(acc.id)} disabled={!editName.trim()} style={{ flex: 1, padding: '10px', background: editName.trim() ? '#F9A08B' : 'rgba(26,26,26,0.04)', border: 'none', borderRadius: '8px', color: '#FFF', fontSize: '12px', fontWeight: 700, cursor: editName.trim() ? 'pointer' : 'not-allowed', transition: 'all 0.2s' }}>{t('common.save')}</button>
                    <button onClick={() => setEditingId(null)} style={{ padding: '10px 14px', background: 'transparent', border: '1px solid rgba(26,26,26,0.08)', borderRadius: '8px', color: '#666666', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>{t('common.cancel')}</button>
                  </div>
                </div>

              ) : isHistory ? (
                <div className={styles.morphContainer} onClick={e => e.stopPropagation()}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
                    <button onClick={() => setHistoryId(null)} style={{ width: '28px', height: '28px', borderRadius: '8px', border: '1.5px solid rgba(26,26,26,0.08)', background: '#FDFCFB', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#1A1A1A', cursor: 'pointer', transition: 'all 0.2s' }} onMouseEnter={e => e.currentTarget.style.background = 'rgba(26,26,26,0.04)'} onMouseLeave={e => e.currentTarget.style.background = '#FDFCFB'}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
                    </button>
                    <div style={{ fontSize: '13px', fontWeight: 800, color: '#1A1A1A' }}>{t('accounts.historyTitle', { name: acc.name })}</div>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                    <div style={{ flex: 1, padding: '10px', background: 'rgba(163,201,168,0.1)', borderRadius: '8px', border: '1px solid rgba(163,201,168,0.2)' }}><div style={{ fontSize: '9px', fontWeight: 800, color: '#7AA080', textTransform: 'uppercase', marginBottom: '4px' }}>{t('accounts.income30d')}</div><div style={{ fontSize: '14px', fontWeight: 800, color: '#4E885B', letterSpacing: '-0.3px' }}>+124.5K</div></div>
                    <div style={{ flex: 1, padding: '10px', background: 'rgba(216,140,154,0.1)', borderRadius: '8px', border: '1px solid rgba(216,140,154,0.2)' }}><div style={{ fontSize: '9px', fontWeight: 800, color: '#BA6D7D', textTransform: 'uppercase', marginBottom: '4px' }}>{t('accounts.expense30d')}</div><div style={{ fontSize: '14px', fontWeight: 800, color: '#A5495B', letterSpacing: '-0.3px' }}>-32.1K</div></div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}><div style={{ width: '26px', height: '26px', borderRadius: '6px', background: 'rgba(163,201,168,0.15)', color: '#5BAB72', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Ico.Up /></div><div style={{ flex: 1 }}><div style={{ fontSize: '12px', fontWeight: 700, color: '#1A1A1A', marginBottom: '2px' }}>{t('accounts.samplePayment')}</div><div style={{ fontSize: '10px', color: '#999999', fontWeight: 500 }}>{t('accounts.sampleTime')}</div></div><div style={{ fontSize: '12px', fontWeight: 800, color: '#5BAB72' }}>+2 500</div></div>
                  </div>
                  <button onClick={() => { setHistoryId(null); onNavigateToOperations(acc.name); }} style={{ width: '100%', padding: '10px', background: 'transparent', border: '1.5px solid rgba(26,26,26,0.08)', borderRadius: '8px', color: '#1A1A1A', fontSize: '12px', fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s' }} onMouseEnter={e => { e.currentTarget.style.borderColor = '#1A1A1A'; }} onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(26,26,26,0.08)'; }}>{t('accounts.openAllOperations')}</button>
                </div>

              ) : (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px', paddingTop: '4px' }}>
                    <div style={{ fontSize: '11px', color: '#666666', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      {acc.name}
                      {acc.is_system && <span style={{ background: 'rgba(26,26,26,0.05)', color: '#666', padding: '2px 6px', borderRadius: '4px', fontSize: '8.5px', fontWeight: 800 }}>{t('accounts.system')}</span>}
                    </div>
                    <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: acc.color + '18', display: 'flex', alignItems: 'center', justifyContent: 'center', color: acc.color }}><TypeIcon /></div>
                  </div>
                  <div style={{ fontSize: '28px', fontWeight: 800, marginBottom: '6px', letterSpacing: '-0.5px', color: '#1A1A1A' }}>{fmt(acc.balance)}</div>
                  <div style={{ fontSize: '11px', color: '#5BAB72', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}><Ico.Up /> +{fmt(acc.daily_change)} {t('accounts.today')}</div>

                  {isSelected && (
                    <div style={{ marginTop: '18px', paddingTop: '14px', borderTop: '1px solid rgba(26,26,26,0.05)', display: 'flex', gap: '6px', flexWrap: 'wrap' }} onClick={e => e.stopPropagation()}>
                      <Btn size="sm" onClick={() => { setHistoryId(null); setEditingId(acc.id); setEditName(acc.name); setEditBalance(acc.balance.toString()); setEditType(acc.type); }}><Ico.Edit />{t('common.edit')}</Btn>
                      <Btn size="sm" onClick={() => { setEditingId(null); setHistoryId(acc.id); }}><Ico.Bar />{t('accounts.history')}</Btn>
                      {!acc.is_system && (
                        <Btn size="sm" v="danger" onClick={() => handleDelete(acc.id)}><Ico.Trash /></Btn>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })}

        {/* Плитка создания (Копилки) */}
        <div style={{ border: addOpen ? '1.5px solid #F9A08B' : '1.5px dashed rgba(26,26,26,0.08)', borderRadius: '16px', padding: '24px', background: addOpen ? '#FFFFFF' : 'transparent', boxShadow: addOpen ? '0 12px 28px rgba(249, 160, 139, 0.04)' : 'none', minHeight: '130px', display: 'flex', flexDirection: 'column', justifyContent: 'center', fontFamily: "'Manrope', sans-serif", transition: 'all 0.25s cubic-bezier(0.2, 0.8, 0.2, 1)', boxSizing: 'border-box' }}>
          {addOpen ? (
            <div className={styles.morphContainer}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(249, 160, 139, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#F9A08B' }}><Ico.Plus /></div>
                <div style={{ fontSize: '12px', fontWeight: 800, color: '#1A1A1A' }}>{t('accounts.newSavingsTitle')}</div>
              </div>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                <input type="text" value={newName} placeholder={t('accounts.namePlaceholder')} onChange={e => setNewName(e.target.value)} onFocus={() => setIsNewInputFocused(true)} onBlur={() => setIsNewInputFocused(false)} style={{ flex: 1, padding: '10px 12px', background: '#FDFCFB', border: isNewInputFocused ? '1.5px solid #F9A08B' : '1.5px solid rgba(26,26,26,0.08)', borderRadius: '8px', fontSize: '13px', fontWeight: 600, color: '#1A1A1A', outline: 'none', boxShadow: isNewInputFocused ? '0 0 0 3px rgba(249, 160, 139, 0.12)' : 'none', transition: 'all 0.2s', minWidth: 0 }} />
                <input type="text" value={newBalance} placeholder={t('accounts.balancePlaceholder', { symbol: currency })} onChange={e => handleNumberInput(e.target.value, setNewBalance)} onFocus={() => setIsNewBalanceFocused(true)} onBlur={() => setIsNewBalanceFocused(false)} style={{ width: '90px', padding: '10px 12px', background: '#FDFCFB', border: isNewBalanceFocused ? '1.5px solid #F9A08B' : '1.5px solid rgba(26,26,26,0.08)', borderRadius: '8px', fontSize: '13px', fontWeight: 700, color: '#1A1A1A', outline: 'none', boxShadow: isNewBalanceFocused ? '0 0 0 3px rgba(249, 160, 139, 0.12)' : 'none', transition: 'all 0.2s', textAlign: 'right' }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px', marginBottom: '18px' }}>
                {[{ id: 'cash', icon: <Ico.Cash />, label: t('accounts.typesShort.cash') }, { id: 'bank', icon: <Ico.Card />, label: t('accounts.typesShort.bank') }, { id: 'online', icon: <Ico.World />, label: t('accounts.typesShort.online') }].map(btn => (
                  <button key={btn.id} type="button" onClick={() => setNewType(btn.id)} style={{ padding: '8px 4px', background: newType === btn.id ? 'rgba(249, 160, 139, 0.05)' : '#FDFCFB', border: newType === btn.id ? '1.5px solid #F9A08B' : '1.5px solid rgba(26,26,26,0.06)', borderRadius: '8px', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', color: newType === btn.id ? '#F9A08B' : '#666666', transition: 'all 0.15s' }}>
                    {btn.icon}<span style={{ fontSize: '9px', fontWeight: 700 }}>{btn.label}</span>
                  </button>
                ))}
              </div>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button onClick={handleSaveNew} disabled={!newName.trim()} style={{ flex: 1, padding: '10px', background: newName.trim() ? '#F9A08B' : 'rgba(26,26,26,0.04)', border: 'none', borderRadius: '8px', color: '#FFF', fontSize: '12px', fontWeight: 700, cursor: newName.trim() ? 'pointer' : 'not-allowed', transition: 'all 0.2s' }}>{t('common.create')}</button>
                <button onClick={() => { setAddOpen(false); setNewName(''); setNewBalance(''); }} style={{ padding: '10px 14px', background: 'transparent', border: '1px solid rgba(26,26,26,0.08)', borderRadius: '8px', color: '#666666', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>{t('common.cancel')}</button>
              </div>
            </div>
          ) : (
            <button onClick={() => setAddOpen(true)} style={{ width: '100%', height: '100%', background: 'transparent', border: 'none', cursor: 'pointer', color: '#666666', fontSize: '13px', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontFamily: "'Manrope', sans-serif", transition: 'all 0.2s' }} onMouseEnter={e => { e.currentTarget.parentElement!.style.borderColor = '#F9A08B'; e.currentTarget.parentElement!.style.background = 'rgba(249,160,139,0.02)'; e.currentTarget.style.color = '#F9A08B'; }} onMouseLeave={e => { if (!addOpen) { e.currentTarget.parentElement!.style.borderColor = 'rgba(26,26,26,0.08)'; e.currentTarget.parentElement!.style.background = 'transparent'; e.currentTarget.style.color = '#666666'; } }}>
              <Ico.Plus /> {t('accounts.createSavings')}
            </button>
          )}
        </div>
      </div>

      <ConfirmModal open={confirm.open} title={t('accounts.deleteConfirmTitle')} text={t('accounts.deleteConfirmText')} onConfirm={confirmDelete} onCancel={() => setConfirm({ open: false, id: null })} danger />
    </>
  );
}
