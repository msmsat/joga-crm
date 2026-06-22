import { useState } from 'react';
import type { ToastType, Counterparty } from '../../types';
import { COUNTERPARTIES_DATA, fmt } from '../../constants';
import { Ico } from '../ui/FinanceIcons';
import { Btn } from '../ui/Btn';
import { Badge } from '../ui/Badge';
import { ConfirmModal } from '../ui/ConfirmModal';

export default function CounterpartiesTab({ showToast }: { showToast: (msg: string, t?: ToastType) => void }) {
  const [counterparties, setCounterparties] = useState<Counterparty[]>(COUNTERPARTIES_DATA);
  const [selected, setSelected] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: '', inn: '', type: 'Юр. лицо', category: '' });
  const [confirm, setConfirm] = useState<{ open: boolean; id: number | null }>({ open: false, id: null });

  const handleAdd = () => {
    if (!form.name.trim()) { showToast('Введите название', 'error'); return; }
    const colors = ['#FCAE91', '#7EB5D6', '#A3C9A8', '#D88C9A'];
    setCounterparties(prev => [...prev, {
      id: Date.now(), name: form.name, inn: form.inn || '—', type: form.type,
      category: form.category || 'Прочее', balance: 0, deals: 0,
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

  return (
    <>
      {/* Хедер */}
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
        <Btn v="primary" onClick={() => setAdding(true)}><Ico.Plus /> Добавить</Btn>
      </div>

      {/* Форма добавления */}
      {adding && (
        <div className="card" style={{ border: '1.5px solid var(--accent)', background: 'rgba(252,174,145,0.03)', marginBottom: '16px' }}>
          <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Ico.Building /> Новый контрагент
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
            {[
              { label: 'Название / ФИО', placeholder: 'ООО «Название»', key: 'name' },
              { label: 'ИНН', placeholder: '7701234567', key: 'inn' },
              { label: 'Категория', placeholder: 'Аренда, Поставщик…', key: 'category' },
            ].map(f => (
              <div key={f.key}>
                <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text3)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.4px' }}>{f.label}</div>
                <input className="search-input" style={{ width: '100%' }} placeholder={f.placeholder}
                  value={form[f.key as keyof typeof form]}
                  onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                />
              </div>
            ))}
            <div>
              <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text3)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Тип</div>
              <select className="search-input" style={{ width: '100%', appearance: 'none' }}
                value={form.type} onChange={e => setForm(prev => ({ ...prev, type: e.target.value }))}>
                <option>Юр. лицо</option>
                <option>ИП</option>
                <option>Физ. лицо</option>
              </select>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <Btn v="primary" onClick={handleAdd}>Сохранить</Btn>
            <Btn onClick={() => setAdding(false)}>Отмена</Btn>
          </div>
        </div>
      )}

      {/* Список */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {counterparties.map((cp, i) => (
          <div key={cp.id}>
            <div
              onClick={() => setSelected(selected === cp.id ? null : cp.id)}
              style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '16px 20px', borderBottom: i < counterparties.length - 1 ? '1px solid var(--border)' : 'none', cursor: 'pointer', background: selected === cp.id ? 'rgba(252,174,145,0.04)' : 'transparent', transition: 'background 0.15s' }}
            >
              <div style={{ width: '42px', height: '42px', borderRadius: '12px', flexShrink: 0, background: cp.color + '22', display: 'flex', alignItems: 'center', justifyContent: 'center', color: cp.color }}>
                {cp.type === 'Физ. лицо' ? <Ico.User /> : <Ico.Building />}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '2px' }}>{cp.name}</div>
                <div style={{ fontSize: '11px', color: 'var(--text3)' }}>{cp.type} · ИНН {cp.inn}</div>
              </div>
              <Badge text={cp.category} color={cp.color} bg={cp.color + '18'} />
              <div style={{ textAlign: 'right', marginLeft: '8px' }}>
                <div style={{ fontSize: '13px', fontWeight: 700, color: '#D88C9A' }}>{fmt(Math.abs(cp.balance))}</div>
                <div style={{ fontSize: '10px', color: 'var(--text3)' }}>{cp.deals} сделок</div>
              </div>
              <div style={{ color: 'var(--text3)', transition: 'transform 0.2s', transform: selected === cp.id ? 'rotate(90deg)' : 'none' }}>
                <Ico.Chevron />
              </div>
            </div>

            {selected === cp.id && (
              <div style={{ background: 'rgba(252,174,145,0.03)', padding: '16px 20px', borderBottom: i < counterparties.length - 1 ? '1px solid var(--border)' : 'none' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '14px' }}>
                  {[['Сделок', cp.deals], ['Задолженность', fmt(Math.abs(cp.balance))], ['Категория', cp.category]].map(([l, v]) => (
                    <div key={l as string}>
                      <div style={{ fontSize: '10px', color: 'var(--text3)', fontWeight: 600, marginBottom: '3px', textTransform: 'uppercase' }}>{l}</div>
                      <div style={{ fontSize: '14px', fontWeight: 700 }}>{v}</div>
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <Btn size="sm" onClick={() => showToast('Документы открыты')}><Ico.Doc />Документы</Btn>
                  <Btn size="sm" onClick={() => showToast('Редактирование открыто')}><Ico.Edit />Редактировать</Btn>
                  <Btn size="sm" v="danger" onClick={() => setConfirm({ open: true, id: cp.id })}><Ico.Trash />Удалить</Btn>
                </div>
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
