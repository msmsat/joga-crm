import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ToastType } from '../../types';
import type { FinancialGoal } from '../../../../../api/finances/finances.types';
import { Ico } from '../ui/FinanceIcons';
import { ConfirmModal } from '../ui/ConfirmModal';
import styles from '../../Finances.module.css';
import { useStudioCurrency } from '../../../../../hooks/useStudioCurrency';
import { getCurrencySymbol } from '../../../../../components/UI';
import { InfoHint } from '../../../../../components/ui/InfoHint';
import { useGoals, useFinanceMutations, useOperationCategories } from '../../hooks/useFinances';

const GOAL_COLORS = ['#FCAE91', '#A3C9A8', '#7EB5D6', '#D88C9A'];
const goalColor = (id: number) => GOAL_COLORS[id % GOAL_COLORS.length];

export default function GoalsTab({ showToast }: { showToast: (msg: string, t?: ToastType) => void }) {
  const { t } = useTranslation('finances');
  const currency = getCurrencySymbol(useStudioCurrency());
  const fmt = (n: number) => `${currency}${n.toLocaleString('ru-RU')}`;
  const { data: goals = [], isLoading: loading } = useGoals();
  const { createGoal, updateGoal, deleteGoal } = useFinanceMutations();

  const [confirm, setConfirm] = useState<{ open: boolean; id: number | null }>({ open: false, id: null });
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ title: '', target: '', deadline: '', category: '', priority: 'medium', trackingMode: 'auto', opType: 'in' as 'in' | 'out' });
  const { data: categoryOptions = [] } = useOperationCategories(form.opType);
  const [isInputFocused, setIsInputFocused] = useState<{ [key: string]: boolean }>({});
  const [fundGoalId, setFundGoalId] = useState<number | null>(null);
  const [fundAmount, setFundAmount] = useState('');
  const [isFundFocused, setIsFundFocused] = useState(false);

  const [editingGoalId, setEditingGoalId] = useState<number | null>(null);
  const [editGTitle, setEditGTitle] = useState('');
  const [editGTarget, setEditGTarget] = useState('');
  const [editGDeadline, setEditGDeadline] = useState('');
  const [editGFocused, setEditGFocused] = useState<string | null>(null);

  const openGoalEdit = (g: FinancialGoal) => { setEditingGoalId(g.id); setEditGTitle(g.title); setEditGTarget(String(g.target_amount)); setEditGDeadline(g.deadline ?? ''); };
  const saveGoalEdit = async (g: FinancialGoal) => {
    if (!editGTitle.trim()) { showToast(t('goals.toasts.enterName'), 'error'); return; }
    try {
      await updateGoal(g.id, {
        title: editGTitle.trim(),
        target_amount: parseInt(editGTarget) || g.target_amount,
        deadline: editGDeadline.trim() || null,
      });
      setEditingGoalId(null);
      showToast(t('goals.toasts.updated'), 'success');
    } catch {
      // тост с текстом ошибки сервера уже показан в useFinanceMutations
    }
  };
  const gInp = (key: string): React.CSSProperties => ({
    width: '100%', padding: '8px 12px', background: '#FDFCFB',
    border: editGFocused === key ? '1.5px solid #F9A08B' : '1.5px solid rgba(26,26,26,0.08)',
    borderRadius: '8px', fontSize: '13px', fontWeight: 600, color: '#1A1A1A',
    outline: 'none', boxShadow: editGFocused === key ? '0 0 0 3px rgba(249,160,139,0.12)' : 'none',
    transition: 'border-color 0.18s, box-shadow 0.18s', fontFamily: 'var(--font)', boxSizing: 'border-box' as const,
  });

  const handleAdd = async () => {
    if (!form.title.trim() || !form.target) { showToast(t('goals.toasts.fillRequired'), 'error'); return; }
    if (form.trackingMode === 'auto' && !form.category) { showToast(t('goals.toasts.chooseCategory'), 'error'); return; }
    try {
      await createGoal({
        title: form.title.trim(),
        target_amount: parseInt(form.target),
        tracking_mode: form.trackingMode as 'auto' | 'manual',
        deadline: form.deadline || null,
        category: form.category || null,
        priority: form.priority,
        op_type: form.opType,
      });
      setForm({ title: '', target: '', deadline: '', category: '', priority: 'medium', trackingMode: 'auto', opType: 'in' });
      setAddOpen(false);
      showToast(t('goals.toasts.created'), 'success');
    } catch {
      // тост уже показан в useFinanceMutations
    }
  };

  const confirmDelete = async () => {
    const id = confirm.id;
    setConfirm({ open: false, id: null });
    if (id == null) return;
    try {
      await deleteGoal(id);
      showToast(t('goals.toasts.deleted'), 'error');
    } catch {
      // тост уже показан в useFinanceMutations
    }
  };

  const handleFund = async (g: FinancialGoal) => {
    const val = parseInt(fundAmount) || 0;
    if (val <= 0) return;
    try {
      await updateGoal(g.id, { current_amount: g.current_amount + val });
      setFundGoalId(null);
      setFundAmount('');
      showToast(t('goals.toasts.funded'), 'success');
    } catch {
      // тост уже показан в useFinanceMutations
    }
  };

  const handleNumberInput = (val: string, setter: (v: string) => void) => setter(val.replace(/\D/g, ''));

  const priorityColors: Record<string, string> = { high: '#D88C9A', medium: '#F0C060', low: '#A3C9A8' };
  const priorityLabels: Record<string, string> = { high: t('goals.priority.high'), medium: t('goals.priority.medium'), low: t('goals.priority.low') };

  const activeGoals = goals.filter(g => g.current_amount < g.target_amount).length;
  const doneGoals = goals.filter(g => g.current_amount >= g.target_amount).length;
  const avgProgress = Math.round(goals.reduce((s, g) => s + Math.min(g.current_amount / g.target_amount * 100, 100), 0) / (goals.length || 1));

  if (loading) {
    return <div style={{ padding: '64px 20px', textAlign: 'center', color: '#999999', fontSize: '14px', fontWeight: 600 }}>{t('goals.loading')}</div>;
  }

  return (
    <>
      {/* 1. Карточки сводки */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px', marginBottom: '28px' }}>
        <div style={{ background: '#FFFFFF', borderRadius: '16px', padding: '24px', border: '1px solid rgba(26,26,26,0.12)', boxShadow: '0 12px 32px -4px rgba(26,26,26,0.02)', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: '-20px', right: '-20px', width: '100px', height: '100px', background: 'radial-gradient(circle, rgba(249,160,139,0.15) 0%, transparent 70%)', borderRadius: '50%' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'rgba(249,160,139,0.12)', color: '#F9A08B', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Ico.Target /></div>
            <div style={{ fontSize: '12px', color: '#666666', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px' }}>{t('goals.active')}</div>
          </div>
          <div style={{ fontSize: '32px', fontWeight: 800, color: '#1A1A1A', letterSpacing: '-1px' }}>{activeGoals}</div>
        </div>

        <div style={{ background: '#FFFFFF', borderRadius: '16px', padding: '24px', border: '1px solid rgba(26,26,26,0.12)', boxShadow: '0 12px 32px -4px rgba(26,26,26,0.02)', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: '-20px', right: '-20px', width: '100px', height: '100px', background: 'radial-gradient(circle, rgba(163,201,168,0.15) 0%, transparent 70%)', borderRadius: '50%' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'rgba(163,201,168,0.12)', color: '#5BAB72', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Ico.Check /></div>
            <div style={{ fontSize: '12px', color: '#666666', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px' }}>{t('goals.done')}</div>
          </div>
          <div style={{ fontSize: '32px', fontWeight: 800, color: '#1A1A1A', letterSpacing: '-1px' }}>{doneGoals}</div>
        </div>

        <div style={{ background: '#FFFFFF', borderRadius: '16px', padding: '24px', border: '1px solid rgba(26,26,26,0.12)', boxShadow: '0 12px 32px -4px rgba(26,26,26,0.02)', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: '-20px', right: '-20px', width: '100px', height: '100px', background: 'radial-gradient(circle, rgba(126,181,214,0.15) 0%, transparent 70%)', borderRadius: '50%' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'rgba(126,181,214,0.12)', color: '#7EB5D6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Ico.Bar /></div>
            <div style={{ fontSize: '12px', color: '#666666', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px' }}>{t('goals.avgProgress')}</div>
          </div>
          <div style={{ fontSize: '32px', fontWeight: 800, color: '#1A1A1A', letterSpacing: '-1px' }}>{avgProgress}%</div>
        </div>
      </div>

      {/* 2. Action island */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px', background: '#FFFFFF', padding: '12px 16px', borderRadius: '16px', border: '1px solid rgba(26,26,26,0.12)', boxShadow: '0 8px 32px -8px rgba(26,26,26,0.04)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', paddingLeft: '8px' }}>
          <div style={{ fontSize: '14px', fontWeight: 800, color: '#1A1A1A' }}>{t('goals.trackingTitle')}</div>
          <InfoHint title={t('tabs.goals')} text={t('info.goals')} />
        </div>
        {!addOpen && (
          <button onClick={() => setAddOpen(true)} style={{ display: 'flex', alignItems: 'center', gap: '8px', height: '44px', padding: '0 20px', background: '#F9A08B', border: 'none', borderRadius: '10px', color: '#FFFFFF', fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: "'Manrope', sans-serif", transition: 'all 0.2s', boxShadow: '0 6px 16px rgba(249, 160, 139, 0.25)' }} onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.filter = 'brightness(1.05)'; }} onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.filter = 'none'; }}>
            <Ico.Plus /> {t('goals.createGoal')}
          </button>
        )}
      </div>

      {/* 3. Форма создания */}
      {addOpen && (
        <div className={styles.morphContainer} style={{ padding: '32px', marginBottom: '24px', background: '#FFFFFF', borderRadius: '16px', border: '1px solid rgba(26,26,26,0.12)', boxShadow: '0 16px 40px -8px rgba(26,26,26,0.06)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
            <div style={{ fontSize: '18px', fontWeight: 800, color: '#1A1A1A', letterSpacing: '-0.3px' }}>{t('goals.newTitle')}</div>
            <button onClick={() => setAddOpen(false)} style={{ background: 'none', border: 'none', color: '#999', cursor: 'pointer', transition: 'color 0.2s' }} onMouseEnter={e => e.currentTarget.style.color='#1A1A1A'} onMouseLeave={e => e.currentTarget.style.color='#999'}><Ico.X /></button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '32px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#666666', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '8px' }}>{t('goals.titleLabel')}</label>
                <input type="text" placeholder={t('goals.titlePlaceholder')} value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} onFocus={() => setIsInputFocused({ ...isInputFocused, title: true })} onBlur={() => setIsInputFocused({ ...isInputFocused, title: false })} style={{ width: '100%', padding: '12px 16px', background: '#FDFCFB', border: isInputFocused['title'] ? '1.5px solid #F9A08B' : '1.5px solid rgba(26,26,26,0.08)', borderRadius: '8px', fontSize: '13px', fontWeight: 500, color: '#1A1A1A', outline: 'none', boxShadow: isInputFocused['title'] ? '0 0 0 3px rgba(249, 160, 139, 0.12)' : 'none', transition: 'all 0.2s', boxSizing: 'border-box' }} />
              </div>
              <div style={{ display: 'flex', gap: '16px' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#666666', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '8px' }}>{t('goals.targetLabel', { symbol: currency })}</label>
                  <input type="text" placeholder={t('goals.targetPlaceholder')} value={form.target} onChange={e => handleNumberInput(e.target.value, val => setForm(p => ({ ...p, target: val })))} onFocus={() => setIsInputFocused({ ...isInputFocused, target: true })} onBlur={() => setIsInputFocused({ ...isInputFocused, target: false })} style={{ width: '100%', padding: '12px 16px', background: '#FDFCFB', border: isInputFocused['target'] ? '1.5px solid #F9A08B' : '1.5px solid rgba(26,26,26,0.08)', borderRadius: '8px', fontSize: '13px', fontWeight: 700, color: '#1A1A1A', outline: 'none', boxShadow: isInputFocused['target'] ? '0 0 0 3px rgba(249, 160, 139, 0.12)' : 'none', transition: 'all 0.2s', boxSizing: 'border-box' }} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#666666', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '8px' }}>{t('goals.deadlineLabel')}</label>
                  <input type="date" value={form.deadline} onChange={e => setForm(p => ({ ...p, deadline: e.target.value }))} onFocus={() => setIsInputFocused({ ...isInputFocused, deadline: true })} onBlur={() => setIsInputFocused({ ...isInputFocused, deadline: false })} style={{ width: '100%', padding: '12px 16px', background: '#FDFCFB', border: isInputFocused['deadline'] ? '1.5px solid #F9A08B' : '1.5px solid rgba(26,26,26,0.08)', borderRadius: '8px', fontSize: '13px', fontWeight: 500, color: '#1A1A1A', outline: 'none', boxShadow: isInputFocused['deadline'] ? '0 0 0 3px rgba(249, 160, 139, 0.12)' : 'none', transition: 'all 0.2s', boxSizing: 'border-box' }} />
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#666666', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '12px' }}>{t('goals.trackingLabel')}</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div onClick={() => setForm(p => ({ ...p, trackingMode: 'auto' }))} style={{ padding: '16px', borderRadius: '12px', border: form.trackingMode === 'auto' ? '2px solid #F9A08B' : '2px solid rgba(26,26,26,0.06)', background: form.trackingMode === 'auto' ? 'rgba(249,160,139,0.04)' : '#FDFCFB', cursor: 'pointer', transition: 'all 0.2s', display: 'flex', gap: '12px' }}>
                  <div style={{ color: form.trackingMode === 'auto' ? '#F9A08B' : '#999', marginTop: '2px' }}><Ico.Bar /></div>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: '#1A1A1A', marginBottom: '2px' }}>{t('goals.trackingAuto')}</div>
                    <div style={{ fontSize: '11px', color: '#666666', lineHeight: 1.4 }}>{t('goals.trackingAutoDesc')}</div>
                  </div>
                </div>
                <div onClick={() => setForm(p => ({ ...p, trackingMode: 'manual' }))} style={{ padding: '16px', borderRadius: '12px', border: form.trackingMode === 'manual' ? '2px solid #F9A08B' : '2px solid rgba(26,26,26,0.06)', background: form.trackingMode === 'manual' ? 'rgba(249,160,139,0.04)' : '#FDFCFB', cursor: 'pointer', transition: 'all 0.2s', display: 'flex', gap: '12px' }}>
                  <div style={{ color: form.trackingMode === 'manual' ? '#F9A08B' : '#999', marginTop: '2px' }}><Ico.Edit /></div>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: '#1A1A1A', marginBottom: '2px' }}>{t('goals.trackingManual')}</div>
                    <div style={{ fontSize: '11px', color: '#666666', lineHeight: 1.4 }}>{t('goals.trackingManualDesc')}</div>
                  </div>
                </div>
              </div>
              {form.trackingMode === 'auto' && (
                <div style={{ marginTop: '10px' }}>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#666666', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '8px' }}>{t('goals.opTypeLabel')}</label>
                  <div style={{ display: 'flex', gap: '6px', marginBottom: '12px' }}>
                    {(['in', 'out'] as const).map(ot => (
                      <button key={ot} type="button" onClick={() => setForm(p => ({ ...p, opType: ot, category: '' }))} style={{ flex: 1, padding: '10px', background: form.opType === ot ? (ot === 'in' ? 'rgba(163,201,168,0.12)' : 'rgba(216,140,154,0.12)') : '#FDFCFB', border: form.opType === ot ? `1.5px solid ${ot === 'in' ? '#5BAB72' : '#D88C9A'}` : '1.5px solid rgba(26,26,26,0.08)', borderRadius: '8px', fontSize: '13px', fontWeight: 700, color: form.opType === ot ? (ot === 'in' ? '#5BAB72' : '#D88C9A') : '#666666', cursor: 'pointer', transition: 'all 0.15s' }}>
                        {ot === 'in' ? t('operations.income') : t('operations.expense')}
                      </button>
                    ))}
                  </div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#666666', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '8px' }}>{t('goals.categoryLabel')}</label>
                  <select value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))} onFocus={() => setIsInputFocused({ ...isInputFocused, category: true })} onBlur={() => setIsInputFocused({ ...isInputFocused, category: false })} style={{ width: '100%', padding: '12px 16px', background: '#FDFCFB', border: isInputFocused['category'] ? '1.5px solid #F9A08B' : '1.5px solid rgba(26,26,26,0.08)', borderRadius: '8px', fontSize: '13px', fontWeight: 500, color: '#1A1A1A', outline: 'none', boxShadow: isInputFocused['category'] ? '0 0 0 3px rgba(249, 160, 139, 0.12)' : 'none', transition: 'all 0.2s', boxSizing: 'border-box' }}>
                    <option value="">{t('goals.categoryPlaceholder')}</option>
                    {categoryOptions.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              )}
              <button onClick={handleAdd} disabled={!form.title.trim() || !form.target} style={{ marginTop: 'auto', padding: '14px', background: form.title.trim() && form.target ? '#F9A08B' : 'rgba(26,26,26,0.04)', border: 'none', borderRadius: '10px', color: form.title.trim() && form.target ? '#FFFFFF' : '#999999', fontSize: '13px', fontWeight: 700, cursor: form.title.trim() && form.target ? 'pointer' : 'not-allowed', transition: 'all 0.2s', boxShadow: form.title.trim() && form.target ? '0 6px 20px rgba(249, 160, 139, 0.25)' : 'none', fontFamily: "'Manrope', sans-serif" }}>
                {t('goals.createGoal')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4. Список целей */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '20px' }}>
        {goals.map(g => {
          const color = goalColor(g.id);
          const pct = Math.min(Math.round(g.current_amount / g.target_amount * 100), 100);
          const done = pct >= 100;
          const pcol = priorityColors[g.priority] || '#999';
          const isFunding = fundGoalId === g.id;

          return (
            <div key={g.id} className={styles.goalCard} style={{ background: done ? 'rgba(163,201,168,0.03)' : '#FFFFFF', border: done ? '1px solid rgba(163,201,168,0.4)' : '1px solid rgba(26,26,26,0.15)', borderRadius: '16px', padding: '24px', transition: 'all 0.3s cubic-bezier(0.2, 0.8, 0.2, 1)', position: 'relative', overflow: 'hidden' }}>
              {editingGoalId === g.id ? (
                <div key="edit" className={styles.morphContainer}>
                  <div style={{ fontSize: '13px', fontWeight: 800, color: '#1A1A1A', marginBottom: '14px' }}>{t('goals.editTitle')}</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '14px' }}>
                    <div>
                      <div style={{ fontSize: '10px', fontWeight: 700, color: '#666666', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '5px' }}>{t('goals.nameLabel')}</div>
                      <input value={editGTitle} onChange={e => setEditGTitle(e.target.value)} onFocus={() => setEditGFocused('title')} onBlur={() => setEditGFocused(null)} placeholder={t('goals.namePlaceholder')} style={gInp('title')} />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                      <div>
                        <div style={{ fontSize: '10px', fontWeight: 700, color: '#666666', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '5px' }}>{t('goals.amountLabel', { symbol: currency })}</div>
                        <input type="number" value={editGTarget} onChange={e => setEditGTarget(e.target.value)} onFocus={() => setEditGFocused('target')} onBlur={() => setEditGFocused(null)} placeholder="0" min="0" style={gInp('target')} />
                      </div>
                      <div>
                        <div style={{ fontSize: '10px', fontWeight: 700, color: '#666666', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '5px' }}>{t('goals.deadlineLabel')}</div>
                        <input type="date" value={editGDeadline} onChange={e => setEditGDeadline(e.target.value)} onFocus={() => setEditGFocused('deadline')} onBlur={() => setEditGFocused(null)} style={gInp('deadline')} />
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={() => saveGoalEdit(g)} style={{ padding: '8px 16px', background: '#F9A08B', border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: 700, color: '#FFFFFF', cursor: 'pointer', transition: 'all 0.2s', fontFamily: "'Manrope', sans-serif" }} onMouseEnter={e => e.currentTarget.style.background = '#f08070'} onMouseLeave={e => e.currentTarget.style.background = '#F9A08B'}>{t('common.save')}</button>
                    <button onClick={() => setEditingGoalId(null)} style={{ padding: '8px 12px', background: 'transparent', border: '1.5px solid rgba(26,26,26,0.08)', borderRadius: '8px', fontSize: '12px', fontWeight: 700, color: '#666666', cursor: 'pointer', transition: 'all 0.2s', fontFamily: "'Manrope', sans-serif" }} onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(26,26,26,0.2)'} onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(26,26,26,0.08)'}>{t('common.cancel')}</button>
                  </div>
                </div>
              ) : (
                <div key="view">
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '16px' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                        {done && <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '10px', fontWeight: 800, color: '#4E885B', background: 'rgba(163,201,168,0.2)', padding: '4px 8px', borderRadius: '6px', textTransform: 'uppercase' }}><Ico.Check /> {t('goals.achieved')}</span>}
                        {!done && <span style={{ fontSize: '10px', fontWeight: 800, color: pcol, background: pcol + '15', padding: '4px 8px', borderRadius: '6px', textTransform: 'uppercase' }}>{priorityLabels[g.priority]}</span>}
                        {g.tracking_mode === 'auto' && !done && (
                          <span style={{ fontSize: '10px', fontWeight: 800, color: g.op_type === 'in' ? '#5BAB72' : '#D88C9A', background: g.op_type === 'in' ? 'rgba(163,201,168,0.15)' : 'rgba(216,140,154,0.15)', padding: '4px 8px', borderRadius: '6px', textTransform: 'uppercase' }}>
                            {g.op_type === 'in' ? t('operations.income') : t('operations.expense')}{g.category ? ` · ${g.category}` : ''}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '16px', fontWeight: 800, color: '#1A1A1A', marginBottom: '4px', lineHeight: 1.3 }}>{g.title}</div>
                      <div style={{ fontSize: '12px', color: '#999999', fontWeight: 500 }}>{t('goals.deadlinePrefix')} {g.deadline ?? t('goals.noDeadline')}</div>
                    </div>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button onClick={() => openGoalEdit(g)} style={{ width: '32px', height: '32px', borderRadius: '8px', border: '1px solid transparent', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999', transition: 'all 0.2s' }} onMouseEnter={e => { e.currentTarget.style.background = 'rgba(249,160,139,0.1)'; e.currentTarget.style.color = '#F9A08B'; }} onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#999'; }} title={t('common.edit')}>
                        <Ico.Edit />
                      </button>
                      <button onClick={() => setConfirm({ open: true, id: g.id })} style={{ width: '32px', height: '32px', borderRadius: '8px', border: '1px solid transparent', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999', transition: 'all 0.2s' }} onMouseEnter={e => { e.currentTarget.style.background = '#FFF5F5'; e.currentTarget.style.color = '#D88C9A'; }} onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#999'; }} title={t('goals.deleteConfirmTitle')}>
                        <Ico.Trash />
                      </button>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <div style={{ fontSize: '24px', fontWeight: 800, color: done ? '#5BAB72' : color, letterSpacing: '-0.5px' }}>{pct}%</div>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: '#1A1A1A' }}>{fmt(g.current_amount)} <span style={{ color: '#999', fontWeight: 500 }}>/ {fmt(g.target_amount)}</span></div>
                  </div>
                  <div style={{ height: '12px', background: 'rgba(26,26,26,0.04)', borderRadius: '12px', overflow: 'hidden', marginBottom: '20px', border: '1px solid rgba(26,26,26,0.02)' }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: done ? '#5BAB72' : color, borderRadius: '12px', transition: 'width 1s cubic-bezier(0.34,1.2,0.64,1)', boxShadow: 'inset 0 -2px 4px rgba(0,0,0,0.1)' }} />
                  </div>

                  {!done && (
                    <div style={{ borderTop: '1px dashed rgba(26,26,26,0.08)', paddingTop: '16px' }}>
                      {g.tracking_mode === 'manual' ? (
                        isFunding ? (
                          <div className={styles.morphContainer} style={{ display: 'flex', gap: '8px' }}>
                            <input
                              type="text" value={fundAmount} placeholder={t('goals.fundPlaceholder', { symbol: currency })} autoFocus
                              onChange={e => handleNumberInput(e.target.value, setFundAmount)}
                              onFocus={() => setIsFundFocused(true)} onBlur={() => setIsFundFocused(false)}
                              style={{ flex: 1, padding: '10px 12px', background: '#FDFCFB', border: isFundFocused ? `1.5px solid ${color}` : '1.5px solid rgba(26,26,26,0.08)', borderRadius: '8px', fontSize: '13px', fontWeight: 700, color: '#1A1A1A', outline: 'none', transition: 'all 0.2s', boxSizing: 'border-box' }}
                            />
                            <button onClick={() => handleFund(g)} disabled={!fundAmount} style={{ padding: '0 16px', background: fundAmount ? color : 'rgba(26,26,26,0.04)', border: 'none', borderRadius: '8px', color: '#FFF', fontSize: '12px', fontWeight: 700, cursor: fundAmount ? 'pointer' : 'not-allowed', transition: 'all 0.2s', fontFamily: "'Manrope', sans-serif" }}>{t('goals.fund')}</button>
                            <button onClick={() => setFundGoalId(null)} style={{ width: '36px', background: 'transparent', border: '1px solid rgba(26,26,26,0.08)', borderRadius: '8px', color: '#666', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Ico.X /></button>
                          </div>
                        ) : (
                          <button onClick={() => setFundGoalId(g.id)} style={{ width: '100%', padding: '12px', background: color + '15', border: 'none', borderRadius: '10px', color, fontSize: '13px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', transition: 'all 0.2s', fontFamily: "'Manrope', sans-serif" }} onMouseEnter={e => e.currentTarget.style.background = color + '25'} onMouseLeave={e => e.currentTarget.style.background = color + '15'}>
                            <Ico.Plus /> {t('goals.addFunds')}
                          </button>
                        )
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#999', fontSize: '11px', fontWeight: 600 }}>
                          <Ico.Bar /> {t('goals.autoHint')}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <ConfirmModal open={confirm.open} title={t('goals.deleteConfirmTitle')} text={t('goals.deleteConfirmText')} onConfirm={confirmDelete} onCancel={() => setConfirm({ open: false, id: null })} danger />
    </>
  );
}
