import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

// ─── ЛОКАЛЬНЫЕ ДАННЫЕ СТРАНИЦЫ (Mock Data) ────────────────────────────────────
// В будущем эти данные будут приходить с бэкенда через useEffect или React Query
const METRICS = [
  { 
    id: 'revenue', 
    title: 'Выручка за месяц', 
    value: '₽284K', 
    change: '↑ 18.4% vs прошлый мес.', 
    color: '#FCAE91', glow: 'rgba(252,174,145,0.2)', 
    route: '/dashboard/finances', // 👈 Ссылка на Финансы
    icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#FCAE91" strokeWidth="2"><line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>, 
    formatTooltip: (v: number) => `₽${(v * 2.84).toFixed(0)}K` 
  },
  {
    id: 'clients',
    title: 'Активных клиентов',
    value: '142',
    change: '↑ 12 новых',
    color: '#5BAB72',
    glow: 'rgba(91,171,114,0.2)',
    route: '/dashboard/clients',
    icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#5BAB72" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>,
    formatTooltip: (v: number) => `${Math.floor(v * 1.42)} чел.`
  },
  { 
    id: 'bookings', 
    title: 'Записей сегодня', 
    value: '37', 
    change: '↑ 5 vs вчера', 
    color: '#4A80C4', glow: 'rgba(74,128,196,0.2)', 
    route: '/dashboard/booking', // 👈 Ссылка на Записи
    icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#4A80C4" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>, 
    formatTooltip: (v: number) => `${Math.floor(v * 0.45)} зап.` 
  },
  { 
    id: 'retention', 
    title: 'Уровень удержания', 
    value: '87%', 
    change: '↑ 3.2%', 
    color: '#D88C9A', glow: 'rgba(216,140,154,0.2)', 
    route: '/dashboard/reports', // 👈 Ссылка на Отчеты
    icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#D88C9A" strokeWidth="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" /></svg>, 
    formatTooltip: (v: number) => `${Math.floor(v * 0.9)}%` 
  }
];

// 2. База данных для графиков (значения от 0 до 100 для высоты столбцов)
const chartData = {
  week: { labels: ['12/5', '19/5', '26/5', '2/6', '9/6', '16/6', '23/6', '30/6'], revenue: [68, 82, 74, 91, 78, 95, 88, 100], clients: [80, 82, 85, 84, 88, 92, 95, 100], bookings: [60, 75, 70, 85, 90, 80, 95, 100], retention: [80, 82, 81, 85, 87, 86, 88, 92] },
  month: { labels: ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг'], revenue: [45, 60, 55, 75, 65, 85, 70, 95], clients: [60, 65, 70, 75, 80, 85, 90, 100], bookings: [50, 55, 60, 70, 80, 75, 90, 95], retention: [75, 78, 80, 82, 85, 87, 89, 90] },
  year: { labels: ['2019', '2020', '2021', '2022', '2023', '2024', '2025', '2026'], revenue: [30, 45, 60, 50, 75, 85, 95, 100], clients: [20, 35, 50, 65, 80, 90, 95, 100], bookings: [30, 40, 55, 65, 75, 85, 95, 100], retention: [60, 65, 70, 75, 80, 85, 88, 92] }
};

// Превратили события в массив для удобного маппинга
const RECENT_EVENTS = [
  { id: 1, type: 'booking', text: <><strong>Мария К.</strong> записалась на пилатес</>, time: '2 мин. назад', color: '#FCAE91' },
  { id: 2, type: 'payment', text: <><strong>Оплата ₽3 500</strong> от Елены Соколовой</>, time: '14 мин. назад', color: '#5BAB72' },
  { id: 3, type: 'system', text: <><strong>Дмитрий П.</strong> активировал абонемент</>, time: '38 мин. назад', color: '#4A80C4' },
  { id: 4, type: 'cancel', text: <><strong>Отмена записи</strong> — Наталья Б. (18:00)</>, time: '1 час назад', color: '#D88C9A' },
  { id: 5, type: 'system', text: <><strong>Новый VIP клиент</strong> — Алексей Морозов</>, time: '2 часа назад', color: '#f0c040' }
];

const svcs: [string, number, string][] = [
  ['Групповой пилатес', 78, '#FCAE91'], 
  ['Индивид. тренировка', 52, '#5BAB72'], 
  ['Йога', 44, '#4A80C4'], 
  ['Стретчинг', 38, '#f0c040']
];

const trainers: [string, string, number][] = [
  ['Анна Н.', '#5BAB72', 94], 
  ['Дарья П.', '#e08060', 81], 
  ['Михаил В.', '#40a8a0', 68]
];

// ─── ГЛАВНЫЙ КОМПОНЕНТ ────────────────────────────────────────────────────────
export default function Overview() {
  const navigate = useNavigate();

  const [period, setPeriod] = useState<'week' | 'month' | 'year'>('week');
  const [activeMetric, setActiveMetric] = useState<string>('revenue'); // По умолчанию Выручка
  const [openMenuId, setOpenMenuId] = useState<number | null>(null);

  // Достаем данные выбранного таба
  const currentPeriodData = chartData[period];
  const { labels } = currentPeriodData;
  // Достаем столбцы для выбранной карточки
  const vals = currentPeriodData[activeMetric as keyof typeof currentPeriodData] as number[];
  
  // Находим настройки активной карточки для цвета и текста
  const activeConfig = METRICS.find(m => m.id === activeMetric)!;

  // Динамические подписи заголовков
  const periodLabel = period === 'week' ? 'по неделям' : period === 'month' ? 'по месяцам' : 'по годам';
  const periodSubLabel = period === 'week' ? 'Последние 8 недель' : period === 'month' ? 'Последние 8 месяцев' : 'Последние 8 лет';

  useEffect(() => {
    const handleClickOutside = () => setOpenMenuId(null);
    document.addEventListener('click', handleClickOutside);
    
    // Важно: убираем слушатель при закрытии компонента, чтобы не нагружать память
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  return (
    <>
      {/* ─── 1. ВЕРХНИЙ РЯД СТАТИСТИКИ (4 КАРТОЧКИ) ─── */}
      <div className="grid-4 mb-20">
        {METRICS.map((metric) => {
          const isActive = activeMetric === metric.id;
          return (
            <div 
              key={metric.id}
              className={`stat-card ${isActive ? 'active' : ''}`}
              onClick={() => setActiveMetric(metric.id)}
              style={{
                // Передаем цвета в CSS-переменные для активного свечения
                '--active-color': metric.color,
                '--active-glow': metric.glow,
              } as React.CSSProperties}
            >
              <div className="stat-icon" style={{ background: metric.glow }}>
                {metric.icon}
              </div>

              {isActive && (
                <div 
                  className="stat-more-btn"
                  onClick={(e) => {
                    e.stopPropagation(); // Не даем клику сбить график
                    navigate(metric.route); // 👈 Магия перехода в нужный раздел!
                  }}
                >
                  Подробнее ↗
                </div>
              )}

              <div className="stat-label">{metric.title}</div>
              <div className="stat-value">{metric.value}</div>
              <div className="stat-change up">{metric.change}</div>
            </div>
          );
        })}
      </div>

      {/* ─── 2. СРЕДНИЙ РЯД (ГРАФИК И СОБЫТИЯ) ─── */}
      <div className="grid-2 mb-20">
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <div>
              {/* Заголовок графика теперь "умный" */}
              <div style={{ fontSize: '14px', fontWeight: 700 }}>
                {activeConfig.title.replace(' за месяц', '').replace(' сегодня', '')} {periodLabel}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text3)' }}>{periodSubLabel}</div>
            </div>
            
            <div className="tabs" style={{ marginBottom: 0 }}>
              <div className={`tab ${period === 'week' ? 'active' : ''}`} onClick={() => setPeriod('week')}>Нед.</div>
              <div className={`tab ${period === 'month' ? 'active' : ''}`} onClick={() => setPeriod('month')}>Мес.</div>
              <div className={`tab ${period === 'year' ? 'active' : ''}`} onClick={() => setPeriod('year')}>Год</div>
            </div>
          </div>
          
          <div id="dash-chart">
            <div className="chart-bars">
              {labels.map((_, i) => {
                // Чтобы столбцы не сливались, активный столбец (последний) или при наведении становится ярким
                // А остальные получают прозрачную версию цвета выбранной метрики
                const baseColor = activeConfig.glow; 
                const hoverColor = activeConfig.color;

                return (
                  <div 
                    key={i} 
                    className="bar" 
                    style={{ 
                      height: `${vals[i]}%`,
                      // Если это последний столбец (текущий период), делаем его ярким
                      background: i === 7 ? hoverColor : baseColor,
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = hoverColor)}
                    onMouseLeave={(e) => (e.currentTarget.style.background = i === 7 ? hoverColor : baseColor)}
                  >
                    <div className="bar-tooltip">
                      {/* Тултип использует правильную формулу (рубли, проценты или штуки) */}
                      {activeConfig.formatTooltip(vals[i])}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="chart-labels">
              {labels.map((lbl, i) => <div key={i} className="chart-label">{lbl}</div>)}
            </div>
          </div>
        </div>
        
        <div className="card">
          <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '16px' }}>Последние события</div>
          
          {/* Рендерим события через map с выпадающим меню */}
          {RECENT_EVENTS.map((ev) => (
            <div key={ev.id} className="activity-item">
              <div className="activity-dot" style={{ background: ev.color }}></div>
              <div>
                <div className="activity-text">{ev.text}</div>
                <div className="activity-time">{ev.time}</div>
              </div>
              
              <button 
                className={`activity-action-btn ${openMenuId === ev.id ? 'is-open' : ''}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setOpenMenuId(openMenuId === ev.id ? null : ev.id);
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/></svg>
              </button>

              {/* Выпадающее меню с контекстными действиями */}
              {openMenuId === ev.id && (
                <div className="activity-dropdown" onClick={(e) => e.stopPropagation()}>
                  <div className="dropdown-item">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                    Открыть профиль
                  </div>
                  
                  {ev.type === 'booking' && (
                    <div className="dropdown-item">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#5BAB72" strokeWidth="2"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
                      Написать в WhatsApp
                    </div>
                  )}

                  {ev.type === 'payment' && (
                    <div className="dropdown-item">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
                      Отправить чек
                    </div>
                  )}

                  {(ev.type === 'booking' || ev.type === 'cancel') && (
                    <div className="dropdown-item danger">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                      Отменить запись
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ─── 3. НИЖНИЙ РЯД (ТОП УСЛУГ, ТРЕНЕРЫ, КАССА) ─── */}
      <div className="grid-3">
        <div className="card card-sm">
          <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '12px' }}>Топ услуги</div>
          <div>
            {svcs.map(([n, p, c], i) => (
              <div key={i} style={{ marginBottom: '10px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '3px' }}>
                  <span>{n}</span><span style={{ fontWeight: 700 }}>{p}%</span>
                </div>
                <div style={{ height: '4px', background: 'rgba(0,0,0,0.05)', borderRadius: '4px' }}>
                  <div style={{ width: `${p}%`, height: '100%', background: c, borderRadius: '4px', transition: 'width 1s' }}></div>
                </div>
              </div>
            ))}
          </div>
        </div>
        
        <div className="card card-sm">
          <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '12px' }}>Нагрузка тренеров</div>
          <div>
            {trainers.map(([n, c, p], i) => (
              <div key={i} style={{ marginBottom: '10px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '3px' }}>
                  <span>{n}</span><span style={{ fontWeight: 700 }}>{p}%</span>
                </div>
                <div style={{ height: '4px', background: 'rgba(0,0,0,0.05)', borderRadius: '4px' }}>
                  <div style={{ width: `${p}%`, height: '100%', background: c, borderRadius: '4px' }}></div>
                </div>
              </div>
            ))}
          </div>
        </div>
        
        <div className="card card-sm">
          <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '12px' }}>Кассы (сегодня)</div>
          <div style={{ marginBottom: '8px' }}>
            <div style={{ fontSize: '11px', color: 'var(--text3)', marginBottom: '2px' }}>Основная касса</div>
            <div style={{ fontSize: '22px', fontWeight: 800 }}>₽48 200</div>
          </div>
          <div style={{ height: '1px', background: 'var(--border)', margin: '8px 0' }}></div>
          <div style={{ marginBottom: '6px' }}>
            <div style={{ fontSize: '11px', color: 'var(--text3)', marginBottom: '2px' }}>Безналичный расчёт</div>
            <div style={{ fontSize: '16px', fontWeight: 700 }}>₽82 400</div>
          </div>
          <div style={{ marginBottom: '6px' }}>
            <div style={{ fontSize: '11px', color: 'var(--text3)', marginBottom: '2px' }}>Онлайн платежи</div>
            <div style={{ fontSize: '16px', fontWeight: 700 }}>₽34 100</div>
          </div>
          <div style={{ height: '1px', background: 'var(--border)', margin: '8px 0' }}></div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontSize: '12px', color: 'var(--text3)' }}>Итого за день</div>
            <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--accent2)' }}>₽164 700</div>
          </div>
        </div>
      </div>
    </>
  );
}