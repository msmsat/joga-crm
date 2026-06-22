import type { Period } from '../../types';
import { PERIOD_LABELS } from '../../constants';

const SUMMARY_SECTIONS = [
  {
    title: 'Клиенты', color: 'var(--accent)',
    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.85"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
    stats: [{ l: 'Всего', v: '142' }, { l: 'Активных', v: '89' }, { l: 'Новых', v: '12' }, { l: 'Отток', v: '4' }],
  },
  {
    title: 'Занятия', color: '#5BAB72',
    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
    stats: [{ l: 'Проведено', v: '318' }, { l: 'Отменено', v: '14' }, { l: 'Ср. чел.', v: '8.2' }, { l: 'Загрузка', v: '78%' }],
  },
  {
    title: 'Финансы', color: '#4A80C4',
    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M6 11h8a4 4 0 0 0 0-8H6v8zm0 0H4m2 0v8"/><line x1="4" y1="15" x2="10" y2="15"/></svg>,
    stats: [{ l: 'Выручка', v: '₽284K' }, { l: 'Расходы', v: '₽112K' }, { l: 'Прибыль', v: '₽172K' }, { l: 'Маржа', v: '60.6%' }],
  },
];

const ACTIVITY_FEED = [
  { text: 'Новый клиент Мария Коваленко — оплатила абонемент на 8 занятий', time: '14:32', color: '#5BAB72', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.85"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg> },
  { text: 'Групповой пилатес в 11:00 — заполнен на 100% (8/8 мест)',         time: '11:02', color: 'var(--accent)', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> },
  { text: 'Выручка перевалила отметку ₽280K за месяц',                        time: '09:44', color: '#4A80C4', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M6 11h8a4 4 0 0 0 0-8H6v8zm0 0H4m2 0v8"/><line x1="4" y1="15" x2="10" y2="15"/></svg> },
  { text: 'Анна Соколова оставила отзыв ★★★★★',                              time: 'Вчера',    color: '#f0c040', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg> },
  { text: 'Тренер Анна Смирнова выполнила план продаж на 94%',                time: 'Вчера',    color: 'var(--accent)', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="8" r="6"/><path d="M15.477 12.89L17 22l-5-3-5 3 1.523-9.11"/></svg> },
  { text: 'Продан подарочный сертификат на ₽5 000',                           time: '3 дня назад', color: '#D88C9A', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><line x1="16.5" y1="9.4" x2="7.5" y2="4.21"/><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg> },
];

export interface TabAllProps {
  period: Period;
}

export function TabAll({ period }: TabAllProps) {
  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '20px' }}>
        {SUMMARY_SECTIONS.map(({ title, icon, stats, color }) => (
          <div key={title} className="card">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', color }}>
              {icon}<span style={{ fontSize: '14px', fontWeight: 700 }}>{title}</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              {stats.map(({ l, v }) => (
                <div key={l} style={{ background: 'var(--bg)', borderRadius: '8px', padding: '10px' }}>
                  <div style={{ fontSize: '16px', fontWeight: 800 }}>{v}</div>
                  <div style={{ fontSize: '10px', color: 'var(--text3)', fontWeight: 600, marginTop: '2px' }}>{l}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="card">
        <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '16px' }}>
          Лента активности за {PERIOD_LABELS[period].toLowerCase()}
        </div>
        {ACTIVITY_FEED.map(({ icon, text, time, color }, i) => (
          <div key={i} style={{ display: 'flex', gap: '12px', padding: '12px 0', borderBottom: i < ACTIVITY_FEED.length - 1 ? '1px solid var(--border)' : 'none' }}>
            <div style={{ width: '32px', height: '32px', borderRadius: '8px', flexShrink: 0, background: `${color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', color }}>
              {icon}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '13px', color: 'var(--text2)' }}>{text}</div>
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text3)', whiteSpace: 'nowrap', flexShrink: 0, marginTop: '2px' }}>{time}</div>
          </div>
        ))}
      </div>
    </>
  );
}
