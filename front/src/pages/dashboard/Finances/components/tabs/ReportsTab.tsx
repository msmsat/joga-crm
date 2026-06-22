import { useState } from 'react';
import type { ToastType } from '../../types';
import { fmt } from '../../constants';
import { Ico } from '../ui/FinanceIcons';
import { Btn } from '../ui/Btn';
import styles from '../../Finances.module.css';

export default function ReportsTab({ showToast }: { showToast: (msg: string, t?: ToastType) => void }) {
  const [period, setPeriod] = useState('Месяц');
  const [breakdownView, setBreakdownView] = useState<'income' | 'expense'>('expense');
  const [hoveredSeg, setHoveredSegment] = useState<number | null>(null);

  const bars = [
    { label: 'Пн', income: 45000, expense: 12000 },
    { label: 'Вт', income: 38000, expense: 8000 },
    { label: 'Ср', income: 72000, expense: 25000 },
    { label: 'Чт', income: 55000, expense: 18000 },
    { label: 'Пт', income: 89000, expense: 15000 },
    { label: 'Сб', income: 120000, expense: 30000 },
    { label: 'Вс', income: 63000, expense: 10000 },
  ];
  const maxVal = Math.max(...bars.map(b => Math.max(b.income, b.expense)));

  const expensesData = [
    { id: 1, label: 'Зарплата команды', value: 120000, color: '#D88C9A' },
    { id: 2, label: 'Аренда помещения', value: 80000, color: '#E8A0B0' },
    { id: 3, label: 'Маркетинг и реклама', value: 35000, color: '#F0B4C0' },
    { id: 4, label: 'Налоги и взносы', value: 15000, color: '#F8C8D0' },
  ];
  const incomeData = [
    { id: 1, label: 'Абонементы', value: 250000, color: '#5BAB72' },
    { id: 2, label: 'Разовые визиты', value: 120000, color: '#7AA080' },
    { id: 3, label: 'Продажа товаров (Вода, Мерч)', value: 45000, color: '#9AB5A0' },
    { id: 4, label: 'Сдача в субаренду', value: 67000, color: '#B5C9B8' },
  ];

  const currentBreakdown = breakdownView === 'expense' ? expensesData : incomeData;
  const breakdownTotal = currentBreakdown.reduce((sum, item) => sum + item.value, 0);

  const renderDonut = () => {
    const r = 54;
    const circ = 2 * Math.PI * r;
    let offset = 0;

    return (
      <svg width="160" height="160" viewBox="0 0 160 160" style={{ transform: 'rotate(-90deg)', filter: 'drop-shadow(0 8px 16px rgba(0,0,0,0.06))' }}>
        <circle cx="80" cy="80" r={r} fill="none" stroke="rgba(26,26,26,0.03)" strokeWidth="22" />
        {currentBreakdown.map((item) => {
          const pct = item.value / breakdownTotal;
          const dash = pct * circ;
          const gap = circ - dash;
          const isHovered = hoveredSeg === item.id;
          const strokeWidth = isHovered ? 26 : 22;
          const el = (
            <circle
              key={item.id} cx="80" cy="80" r={r} fill="none" stroke={item.color}
              strokeWidth={strokeWidth} strokeDasharray={`${dash} ${gap}`} strokeDashoffset={-offset * circ}
              strokeLinecap="round"
              style={{ transition: 'all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)', cursor: 'pointer', opacity: hoveredSeg === null || hoveredSeg === item.id ? 1 : 0.3 }}
              onMouseEnter={() => setHoveredSegment(item.id)}
              onMouseLeave={() => setHoveredSegment(null)}
            />
          );
          offset += pct;
          return el;
        })}
      </svg>
    );
  };

  return (
    <>
      {/* 1. Метрики */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
        {[
          { label: 'Выручка', value: '₽482 000', delta: '+12%', good: true, c1: '#A3C9A8', c2: 'rgba(163,201,168,0.15)', icon: <Ico.Up /> },
          { label: 'Расходы', value: '₽118 000', delta: '-4%', good: true, c1: '#D88C9A', c2: 'rgba(216,140,154,0.15)', icon: <Ico.Down /> },
          { label: 'Прибыль', value: '₽364 000', delta: '+18%', good: true, c1: '#F9A08B', c2: 'rgba(249,160,139,0.15)', icon: <Ico.Dollar /> },
          { label: 'Рентабельность', value: '75.5%', delta: '+3.2pp', good: true, c1: '#7EB5D6', c2: 'rgba(126,181,214,0.15)', icon: <Ico.Target /> },
        ].map(m => (
          <div key={m.label} style={{ background: '#FFFFFF', borderRadius: '16px', padding: '24px', border: '1px solid rgba(26,26,26,0.12)', boxShadow: '0 12px 32px -4px rgba(26,26,26,0.02)', position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: '-15px', right: '-15px', width: '80px', height: '80px', background: `radial-gradient(circle, ${m.c2} 0%, transparent 70%)`, borderRadius: '50%' }} />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <div style={{ fontSize: '12px', fontWeight: 700, color: '#666666', textTransform: 'uppercase', letterSpacing: '0.6px' }}>{m.label}</div>
              <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: m.c2, color: m.c1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{m.icon}</div>
            </div>
            <div style={{ fontSize: '28px', fontWeight: 800, letterSpacing: '-0.5px', color: '#1A1A1A', marginBottom: '8px' }}>{m.value}</div>
            <div style={{ fontSize: '12px', fontWeight: 700, color: m.good ? '#5BAB72' : '#D88C9A', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ padding: '2px 6px', background: m.good ? 'rgba(91,171,114,0.1)' : 'rgba(216,140,154,0.1)', borderRadius: '6px' }}>{m.delta}</span> к прошлому периоду
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '24px', marginBottom: '24px' }}>
        {/* 2. График движения средств */}
        <div style={{ background: '#FFFFFF', borderRadius: '16px', border: '1px solid rgba(26,26,26,0.12)', boxShadow: '0 12px 32px -4px rgba(26,26,26,0.02)', padding: '28px', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '32px' }}>
            <div>
              <div style={{ fontSize: '18px', fontWeight: 800, color: '#1A1A1A', letterSpacing: '-0.3px', marginBottom: '4px' }}>Движение средств</div>
              <div style={{ fontSize: '12px', color: '#666666', fontWeight: 500 }}>Анализ доходов и расходов</div>
            </div>
            <div style={{ display: 'flex', gap: '4px', background: 'rgba(26,26,26,0.03)', border: '1px solid rgba(26,26,26,0.04)', borderRadius: '10px', padding: '4px' }}>
              {['Неделя', 'Месяц', 'Год'].map(p => (
                <button key={p} onClick={() => setPeriod(p)} style={{ padding: '6px 14px', borderRadius: '6px', fontSize: '12px', fontWeight: 700, border: 'none', cursor: 'pointer', fontFamily: "'Manrope', sans-serif", background: period === p ? '#FFFFFF' : 'transparent', color: period === p ? '#1A1A1A' : '#666666', boxShadow: period === p ? '0 2px 8px rgba(26,26,26,0.06)' : 'none', transition: 'all 0.2s' }}>{p}</button>
              ))}
            </div>
          </div>

          <div style={{ flex: 1, display: 'flex', gap: '16px', alignItems: 'flex-end', height: '240px' }}>
            {bars.map(b => (
              <div key={b.label} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', height: '100%', justifyContent: 'flex-end' }}>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: '4px', width: '100%', height: '100%' }}>
                  <div title={`Доход: ${fmt(b.income)}`} className={styles.reportBar} style={{ flex: 1, height: `${(b.income / maxVal) * 100}%`, background: 'linear-gradient(180deg, #A3C9A8 0%, rgba(163,201,168,0.4) 100%)', borderRadius: '6px 6px 4px 4px', minHeight: '4px' }} />
                  <div title={`Расход: ${fmt(b.expense)}`} className={styles.reportBar} style={{ flex: 1, height: `${(b.expense / maxVal) * 100}%`, background: 'linear-gradient(180deg, #D88C9A 0%, rgba(216,140,154,0.4) 100%)', borderRadius: '6px 6px 4px 4px', minHeight: '4px' }} />
                </div>
                <div style={{ fontSize: '11px', color: '#999999', fontWeight: 700, textTransform: 'uppercase' }}>{b.label}</div>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: '20px', marginTop: '24px', paddingTop: '20px', borderTop: '1px solid rgba(26,26,26,0.04)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', fontWeight: 600, color: '#666666' }}>
              <div style={{ width: '12px', height: '12px', borderRadius: '4px', background: '#A3C9A8' }} /> Доходы
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', fontWeight: 600, color: '#666666' }}>
              <div style={{ width: '12px', height: '12px', borderRadius: '4px', background: '#D88C9A' }} /> Расходы
            </div>
            <div style={{ marginLeft: 'auto' }}>
              <Btn size="sm" onClick={() => showToast('Отчёт экспортируется...', 'info')}><Ico.Download /> Экспорт PDF</Btn>
            </div>
          </div>
        </div>

        {/* 3. Детализация (Breakdown) */}
        <div style={{ background: '#FFFFFF', borderRadius: '16px', border: '1px solid rgba(26,26,26,0.12)', boxShadow: '0 12px 32px -4px rgba(26,26,26,0.02)', padding: '28px', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', gap: '4px', background: 'rgba(26,26,26,0.03)', border: '1px solid rgba(26,26,26,0.12)', borderRadius: '10px', padding: '4px', marginBottom: '24px' }}>
            <button onClick={() => setBreakdownView('expense')} style={{ flex: 1, padding: '8px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: 700, border: 'none', cursor: 'pointer', fontFamily: "'Manrope', sans-serif", background: breakdownView === 'expense' ? '#FFFFFF' : 'transparent', color: breakdownView === 'expense' ? '#1A1A1A' : '#666666', boxShadow: breakdownView === 'expense' ? '0 2px 8px rgba(26,26,26,0.06)' : 'none', transition: 'all 0.2s' }}>Структура расходов</button>
            <button onClick={() => setBreakdownView('income')} style={{ flex: 1, padding: '8px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: 700, border: 'none', cursor: 'pointer', fontFamily: "'Manrope', sans-serif", background: breakdownView === 'income' ? '#FFFFFF' : 'transparent', color: breakdownView === 'income' ? '#1A1A1A' : '#666666', boxShadow: breakdownView === 'income' ? '0 2px 8px rgba(26,26,26,0.06)' : 'none', transition: 'all 0.2s' }}>Структура доходов</button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '32px', position: 'relative' }}>
            {renderDonut()}
            <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center' }}>
              <div style={{ fontSize: '10px', color: '#999999', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '2px' }}>Всего</div>
              <div style={{ fontSize: '18px', fontWeight: 800, color: '#1A1A1A', letterSpacing: '-0.5px' }}>{fmt(breakdownTotal)}</div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', flex: 1, overflowY: 'auto' }}>
            {currentBreakdown.map((item) => {
              const isHovered = hoveredSeg === item.id;
              const pct = Math.round((item.value / breakdownTotal) * 100);
              return (
                <div
                  key={item.id}
                  style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 12px', borderRadius: '10px', background: isHovered ? 'rgba(26,26,26,0.02)' : 'transparent', cursor: 'pointer', transition: 'all 0.2s', border: '1px solid', borderColor: isHovered ? 'rgba(26,26,26,0.06)' : 'transparent' }}
                  onMouseEnter={() => setHoveredSegment(item.id)}
                  onMouseLeave={() => setHoveredSegment(null)}
                >
                  <div style={{ width: '12px', height: '12px', borderRadius: '4px', background: item.color, flexShrink: 0, transform: isHovered ? 'scale(1.2)' : 'scale(1)', transition: 'transform 0.2s' }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: '#1A1A1A' }}>{item.label}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '13px', fontWeight: 800, color: '#1A1A1A' }}>{fmt(item.value)}</div>
                    <div style={{ fontSize: '11px', color: '#999999', fontWeight: 600 }}>{pct}%</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* 4. Smart Insights */}
      <div className={styles.insightCard}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'linear-gradient(135deg, #F9A08B 0%, #FCAE91 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#FFFFFF', flexShrink: 0, boxShadow: '0 8px 24px rgba(249,160,139,0.3)' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
              <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
              <line x1="12" y1="22.08" x2="12" y2="12"></line>
            </svg>
          </div>
          <div>
            <div style={{ fontSize: '15px', fontWeight: 800, color: '#1A1A1A', marginBottom: '6px' }}>Финансовая сводка и инсайты</div>
            <div style={{ fontSize: '13px', color: '#666666', lineHeight: 1.6 }}>
              Отличный месяц! Ваша <strong>чистая прибыль выросла на 18%</strong>. Мы заметили, что доля оплат абонементов онлайн увеличилась в 2 раза по сравнению с прошлым кварталом. При этом расходы на аренду и зарплату остались в пределах нормы (менее 50% от выручки). Рекомендуем рассмотреть создание резервного фонда.
            </div>
            <div style={{ marginTop: '12px', display: 'flex', gap: '12px' }}>
              <span style={{ display: 'inline-flex', padding: '4px 10px', background: 'rgba(255,255,255,0.6)', border: '1px solid rgba(249,160,139,0.2)', borderRadius: '6px', fontSize: '11px', fontWeight: 700, color: '#F9A08B' }}>Совет: Открыть копилку</span>
              <span style={{ display: 'inline-flex', padding: '4px 10px', background: 'rgba(255,255,255,0.6)', border: '1px solid rgba(249,160,139,0.2)', borderRadius: '6px', fontSize: '11px', fontWeight: 700, color: '#F9A08B' }}>Посмотреть план расходов</span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
