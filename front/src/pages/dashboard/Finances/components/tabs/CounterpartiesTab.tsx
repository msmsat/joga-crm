import { useState } from 'react';
import type { ToastType, Counterparty } from '../../types';
import { COUNTERPARTIES_DATA, fmt } from '../../constants';
import { Ico } from '../ui/FinanceIcons';
import { Btn } from '../ui/Btn';
import { Badge } from '../ui/Badge';
import { ConfirmModal } from '../ui/ConfirmModal';
import styles from '../../Finances.module.css';

const TYPE_OPTIONS = [
  { value: 'Юр. лицо', label: 'Юр. лицо', desc: 'Организация или компания', icon: <Ico.Building /> },
  { value: 'ИП',       label: 'ИП',        desc: 'Индивидуальный предприниматель', icon: <Ico.User /> },
  { value: 'Физ. лицо', label: 'Физ. лицо', desc: 'Частное лицо', icon: <Ico.User /> },
];

export default function CounterpartiesTab({ showToast }: { showToast: (msg: string, t?: ToastType) => void }) {
  const [counterparties, setCounterparties] = useState<Counterparty[]>(COUNTERPARTIES_DATA);
  const [selected, setSelected] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: '', inn: '', type: 'Юр. лицо', category: '' });
  const [focused, setFocused] = useState<Record<string, boolean>>({});
  const [confirm, setConfirm] = useState<{ open: boolean; id: number | null }>({ open: false, id: null });

  // Inline edit state
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [editInn, setEditInn] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [editType, setEditType] = useState('');
  const [editFocused, setEditFocused] = useState<string | null>(null);

  const openEdit = (cp: Counterparty) => {
    setEditingId(cp.id);
    setEditName(cp.name);
    setEditInn(cp.inn ?? '');
    setEditCategory(cp.category ?? '');
    setEditType(cp.counterparty_type);
  };

  const saveEdit = () => {
    if (!editName.trim()) { showToast('Введите название', 'error'); return; }
    setCounterparties(prev => prev.map(c => c.id === editingId
      ? { ...c, name: editName.trim(), inn: editInn.trim() || null, category: editCategory.trim() || c.category, counterparty_type: editType }
      : c
    ));
    setEditingId(null);
    showToast('Изменения сохранены', 'success');
  };

  const cancelEdit = () => setEditingId(null);

  const eInp = (key: string): React.CSSProperties => ({
    width: '100%', padding: '7px 10px', background: '#FDFCFB',
    border: editFocused === key ? '1.5px solid #F9A08B' : '1.5px solid rgba(26,26,26,0.1)',
    borderRadius: '8px', fontSize: '13px', fontWeight: 600, color: '#1A1A1A',
    outline: 'none',
    boxShadow: editFocused === key ? '0 0 0 3px rgba(249,160,139,0.12)' : 'none',
    transition: 'border-color 0.18s, box-shadow 0.18s',
    fontFamily: 'var(--font)', boxSizing: 'border-box',
  });

  const inp = (key: string) => ({
    onFocus: () => setFocused(p => ({ ...p, [key]: true })),
    onBlur:  () => setFocused(p => ({ ...p, [key]: false })),
    style: {
      width: '100%', padding: '12px 16px',
      background: '#FDFCFB',
      border: focused[key] ? '1.5px solid #F9A08B' : '1.5px solid rgba(26,26,26,0.08)',
      borderRadius: '8px', fontSize: '13px', fontWeight: 500, color: '#1A1A1A',
      outline: 'none',
      boxShadow: focused[key] ? '0 0 0 3px rgba(249,160,139,0.12)' : 'none',
      transition: 'all 0.2s', boxSizing: 'border-box' as const,
    },
  });

  const handleAdd = () => {
    if (!form.name.trim()) { showToast('Введите название', 'error'); return; }
    const colors = ['#FCAE91', '#7EB5D6', '#A3C9A8', '#D88C9A'];
    setCounterparties(prev => [...prev, {
      id: Date.now(), name: form.name, inn: form.inn || null, counterparty_type: form.type,
      category: form.category || 'Прочее', balance: 0, deals_count: 0,
      color: colors[prev.length % colors.length],
    }]);
    setForm({ name: '', inn: '', type: 'Юр. лицо', category: '' });
    setAdding(false);
    showToast('Контрагент добавлен', 'success');
  };

  const confirmDelete = () => {
    setCounterparties(prev => prev.filter(c => c.id !== confirm.id));
    setConfirm({ open: false, id: null });
    setSelected(null);
    showToast('Контрагент удалён', 'success');
  };

  const totalDebt = counterparties.reduce((s, c) => s + Math.abs(c.balance), 0);
  const canAdd = form.name.trim().length > 0;

  return (
    <>
      {/* ── Хедер ── */}
      <div className="card" style={{ padding: '24px 28px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '24px', background: 'linear-gradient(135deg, rgba(252,174,145,0.06) 0%, transparent 60%)' }}>
        <svg width="80" height="80" viewBox="0 0 80 80" fill="none" style={{ flexShrink: 0 }}>
          <circle cx="40" cy="40" r="38" stroke="var(--border)" strokeWidth="1" strokeDasharray="4 4" />
          {[{ cx: 40, cy: 12, c: '#FCAE91' }, { cx: 67, cy: 57, c: '#A3C9A8' }, { cx: 13, cy: 57, c: '#7EB5D6' }].map((n, i) => (
            <g key={i}>
              <circle cx={n.cx} cy={n.cy} r="9" fill={n.c + '22'} stroke={n.c} strokeWidth="1.5" />
              <line x1={n.cx} y1={n.cy} x2="40" y2="40" stroke="var(--border)" strokeWidth="1.2" />
            </g>
          ))}
          <circle cx="40" cy="40" r="11" fill="rgba(252,174,145,0.15)" stroke="#FCAE91" strokeWidth="2" />
          <text x="40" y="44" textAnchor="middle" style={{ fontSize: '9px', fill: '#FCAE91', fontWeight: 800, fontFamily: 'var(--font)' }}>Вы</text>
        </svg>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '20px', fontWeight: 800, marginBottom: '4px' }}>{counterparties.length} контрагента</div>
          <div style={{ fontSize: '13px', color: 'var(--text2)', lineHeight: 1.5 }}>
            Общая задолженность: <span style={{ color: '#D88C9A', fontWeight: 700 }}>{fmt(totalDebt)}</span>
          </div>
        </div>
        {!adding && (
          <button
            onClick={() => setAdding(true)}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', height: '44px', padding: '0 20px', background: '#F9A08B', border: 'none', borderRadius: '10px', color: '#FFFFFF', fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: "'Manrope', sans-serif", transition: 'all 0.2s', boxShadow: '0 6px 16px rgba(249,160,139,0.25)' }}
            onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.filter = 'brightness(1.05)'; }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.filter = 'none'; }}
          >
            <Ico.Plus /> Добавить
          </button>
        )}
      </div>

      {/* ── Форма добавления (GoalsTab-паттерн) ── */}
      {adding && (
        <div className={styles.morphContainer} style={{ padding: '32px', marginBottom: '20px', background: '#FFFFFF', borderRadius: '16px', border: '1px solid rgba(26,26,26,0.12)', boxShadow: '0 16px 40px -8px rgba(26,26,26,0.06)' }}>
          {/* Заголовок */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
            <div style={{ fontSize: '18px', fontWeight: 800, color: '#1A1A1A', letterSpacing: '-0.3px' }}>Новый контрагент</div>
            <button onClick={() => setAdding(false)} style={{ background: 'none', border: 'none', color: '#999', cursor: 'pointer', transition: 'color 0.2s', display: 'flex', alignItems: 'center' }} onMouseEnter={e => e.currentTarget.style.color='#1A1A1A'} onMouseLeave={e => e.currentTarget.style.color='#999'}><Ico.X /></button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '32px' }}>
            {/* Левая колонка: поля ввода */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#666666', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '8px' }}>Название / ФИО</label>
                <input
                  type="text"
                  placeholder="ООО «Название» или Иванов И.И."
                  value={form.name}
                  onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                  onKeyDown={e => e.key === 'Enter' && canAdd && handleAdd()}
                  {...inp('name')}
                />
              </div>

              <div style={{ display: 'flex', gap: '16px' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#666666', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '8px' }}>ИНН</label>
                  <input
                    type="text"
                    placeholder="7701234567"
                    value={form.inn}
                    onChange={e => setForm(p => ({ ...p, inn: e.target.value.replace(/\D/g, '') }))}
                    maxLength={12}
                    {...inp('inn')}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#666666', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '8px' }}>Категория</label>
                  <input
                    type="text"
                    placeholder="Аренда, Поставщик…"
                    value={form.category}
                    onChange={e => setForm(p => ({ ...p, category: e.target.value }))}
                    {...inp('category')}
                  />
                </div>
              </div>
            </div>

            {/* Правая колонка: Тип + кнопка */}
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#666666', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '12px' }}>Тип контрагента</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {TYPE_OPTIONS.map(opt => (
                  <div
                    key={opt.value}
                    onClick={() => setForm(p => ({ ...p, type: opt.value }))}
                    style={{
                      padding: '14px 16px', borderRadius: '12px',
                      border: form.type === opt.value ? '2px solid #F9A08B' : '2px solid rgba(26,26,26,0.06)',
                      background: form.type === opt.value ? 'rgba(249,160,139,0.04)' : '#FDFCFB',
                      cursor: 'pointer', transition: 'all 0.2s',
                      display: 'flex', alignItems: 'center', gap: '12px',
                    }}
                  >
                    <div style={{ color: form.type === opt.value ? '#F9A08B' : '#999', flexShrink: 0 }}>
                      {opt.icon}
                    </div>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 700, color: '#1A1A1A' }}>{opt.label}</div>
                      <div style={{ fontSize: '11px', color: '#666666', marginTop: '1px' }}>{opt.desc}</div>
                    </div>
                  </div>
                ))}
              </div>

              <button
                onClick={handleAdd}
                disabled={!canAdd}
                style={{
                  marginTop: 'auto', paddingTop: '14px', paddingBottom: '14px',
                  background: canAdd ? '#F9A08B' : 'rgba(26,26,26,0.04)',
                  border: 'none', borderRadius: '10px',
                  color: canAdd ? '#FFFFFF' : '#999999',
                  fontSize: '13px', fontWeight: 700,
                  cursor: canAdd ? 'pointer' : 'not-allowed',
                  transition: 'all 0.2s',
                  boxShadow: canAdd ? '0 6px 20px rgba(249,160,139,0.25)' : 'none',
                  fontFamily: "'Manrope', sans-serif",
                  marginBottom: 0,
                }}
                onMouseEnter={e => { if (canAdd) { e.currentTarget.style.transform='translateY(-1px)'; e.currentTarget.style.filter='brightness(1.05)'; } }}
                onMouseLeave={e => { e.currentTarget.style.transform='translateY(0)'; e.currentTarget.style.filter='none'; }}
              >
                Добавить контрагента
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Список ── */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {counterparties.map((cp, i) => (
          <div key={cp.id}>
            <div
              onClick={() => setSelected(selected === cp.id ? null : cp.id)}
              style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '16px 20px', borderBottom: i < counterparties.length - 1 ? '1px solid var(--border)' : 'none', cursor: 'pointer', background: selected === cp.id ? 'rgba(252,174,145,0.04)' : 'transparent', transition: 'background 0.15s' }}
            >
              <div style={{ width: '42px', height: '42px', borderRadius: '12px', flexShrink: 0, background: cp.color + '22', display: 'flex', alignItems: 'center', justifyContent: 'center', color: cp.color }}>
                {cp.counterparty_type === 'Физ. лицо' ? <Ico.User /> : <Ico.Building />}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '2px' }}>{cp.name}</div>
                <div style={{ fontSize: '11px', color: 'var(--text3)' }}>{cp.counterparty_type} · ИНН {cp.inn ?? '—'}</div>
              </div>
              <Badge text={cp.category ?? 'Прочее'} color={cp.color} bg={cp.color + '18'} />
              <div style={{ textAlign: 'right', marginLeft: '8px' }}>
                <div style={{ fontSize: '13px', fontWeight: 700, color: '#D88C9A' }}>{fmt(Math.abs(cp.balance))}</div>
                <div style={{ fontSize: '10px', color: 'var(--text3)' }}>{cp.deals_count} сделок</div>
              </div>
              <div style={{ color: 'var(--text3)', transition: 'transform 0.2s', transform: selected === cp.id ? 'rotate(90deg)' : 'none' }}>
                <Ico.Chevron />
              </div>
            </div>

            {selected === cp.id && (
              <div style={{ background: 'rgba(252,174,145,0.03)', padding: '16px 20px', borderBottom: i < counterparties.length - 1 ? '1px solid var(--border)' : 'none' }}>
                {editingId === cp.id ? (
                  /* ── Inline edit form ── */
                  <div className={styles.morphContainer}>
                    {/* Название */}
                    <div style={{ marginBottom: '10px' }}>
                      <label style={{ display: 'block', fontSize: '10px', fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '5px' }}>Название / ФИО</label>
                      <input
                        autoFocus
                        type="text" value={editName}
                        onChange={e => setEditName(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') cancelEdit(); }}
                        onFocus={() => setEditFocused('name')} onBlur={() => setEditFocused(null)}
                        style={eInp('name')}
                      />
                    </div>
                    {/* ИНН + Категория */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '10px', fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '5px' }}>ИНН</label>
                        <input
                          type="text" value={editInn} maxLength={12}
                          onChange={e => setEditInn(e.target.value.replace(/\D/g, ''))}
                          onFocus={() => setEditFocused('inn')} onBlur={() => setEditFocused(null)}
                          style={eInp('inn')}
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '10px', fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '5px' }}>Категория</label>
                        <input
                          type="text" value={editCategory}
                          onChange={e => setEditCategory(e.target.value)}
                          onFocus={() => setEditFocused('cat')} onBlur={() => setEditFocused(null)}
                          style={eInp('cat')}
                        />
                      </div>
                    </div>
                    {/* Тип */}
                    <div style={{ marginBottom: '14px' }}>
                      <label style={{ display: 'block', fontSize: '10px', fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '6px' }}>Тип</label>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        {['Юр. лицо', 'ИП', 'Физ. лицо'].map(t => (
                          <button key={t} onClick={() => setEditType(t)} style={{ flex: 1, padding: '7px 0', borderRadius: '8px', fontSize: '11px', fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font)', transition: 'all 0.15s', background: editType === t ? '#F9A08B' : 'transparent', border: editType === t ? 'none' : '1.5px solid rgba(26,26,26,0.1)', color: editType === t ? '#fff' : '#888', boxShadow: editType === t ? '0 3px 8px rgba(249,160,139,0.22)' : 'none' }}>
                            {t}
                          </button>
                        ))}
                      </div>
                    </div>
                    {/* Buttons */}
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button onClick={saveEdit} style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '7px 16px', background: 'linear-gradient(135deg, #FCAE91, #F5866E)', border: 'none', borderRadius: '8px', color: '#fff', fontSize: '12px', fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font)', boxShadow: '0 4px 12px rgba(249,160,139,0.25)', transition: 'filter 0.15s' }}
                        onMouseEnter={e => e.currentTarget.style.filter = 'brightness(1.06)'}
                        onMouseLeave={e => e.currentTarget.style.filter = 'none'}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                        Сохранить
                      </button>
                      <button onClick={cancelEdit} style={{ padding: '7px 14px', background: 'none', border: '1.5px solid rgba(26,26,26,0.1)', borderRadius: '8px', color: '#666', fontSize: '12px', fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font)', transition: 'all 0.15s' }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(26,26,26,0.22)'; e.currentTarget.style.color = '#333'; }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(26,26,26,0.1)'; e.currentTarget.style.color = '#666'; }}>
                        Отмена
                      </button>
                    </div>
                  </div>
                ) : (
                  /* ── View mode ── */
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '14px' }}>
                      {[['Сделок', cp.deals_count], ['Задолженность', fmt(Math.abs(cp.balance))], ['Категория', cp.category ?? 'Прочее']].map(([l, v]) => (
                        <div key={l as string}>
                          <div style={{ fontSize: '10px', color: 'var(--text3)', fontWeight: 600, marginBottom: '3px', textTransform: 'uppercase' }}>{l}</div>
                          <div style={{ fontSize: '14px', fontWeight: 700 }}>{v}</div>
                        </div>
                      ))}
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <Btn size="sm" onClick={() => showToast('Документы открыты')}><Ico.Doc />Документы</Btn>
                      <Btn size="sm" onClick={() => openEdit(cp)}><Ico.Edit />Редактировать</Btn>
                      <Btn size="sm" v="danger" onClick={() => setConfirm({ open: true, id: cp.id })}><Ico.Trash />Удалить</Btn>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      <ConfirmModal
        open={confirm.open}
        title="Удалить контрагента?"
        text="Все связанные документы и история сделок останутся, но контрагент будет удалён из списка."
        onConfirm={confirmDelete}
        onCancel={() => setConfirm({ open: false, id: null })}
        danger
      />
    </>
  );
}
