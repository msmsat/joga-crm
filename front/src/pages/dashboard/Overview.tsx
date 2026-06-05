// ─── ЛОКАЛЬНЫЕ ДАННЫЕ СТРАНИЦЫ (Mock Data) ────────────────────────────────────
// В будущем эти данные будут приходить с бэкенда через useEffect или React Query
const weeks = ['12/5', '19/5', '26/5', '2/6', '9/6', '16/6', '23/6', '30/6'];
const vals = [68, 82, 74, 91, 78, 95, 88, 100];

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
  return (
    <>
      {/* ─── 1. ВЕРХНИЙ РЯД СТАТИСТИКИ (4 КАРТОЧКИ) ─── */}
      <div className="grid-4 mb-20">
        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'rgba(252,174,145,0.15)' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#FCAE91" strokeWidth="2"><line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>
          </div>
          <div className="stat-label">Выручка за месяц</div>
          <div className="stat-value">₽284K</div>
          <div className="stat-change up">↑ 18.4% vs прошлый мес.</div>
        </div>
        
        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'rgba(163,201,168,0.15)' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#5BAB72" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /></svg>
          </div>
          <div className="stat-label">Активных клиентов</div>
          <div className="stat-value">142</div>
          <div className="stat-change up">↑ 12 новых</div>
        </div>
        
        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'rgba(100,140,200,0.1)' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#4A80C4" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
          </div>
          <div className="stat-label">Записей сегодня</div>
          <div className="stat-value">37</div>
          <div className="stat-change up">↑ 5 vs вчера</div>
        </div>
        
        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'rgba(216,140,154,0.12)' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#D88C9A" strokeWidth="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" /></svg>
          </div>
          <div className="stat-label">Уровень удержания</div>
          <div className="stat-value">87%</div>
          <div className="stat-change up">↑ 3.2%</div>
        </div>
      </div>

      {/* ─── 2. СРЕДНИЙ РЯД (ГРАФИК И СОБЫТИЯ) ─── */}
      <div className="grid-2 mb-20">
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <div>
              <div style={{ fontSize: '14px', fontWeight: 700 }}>Выручка по неделям</div>
              <div style={{ fontSize: '11px', color: 'var(--text3)' }}>Последние 8 недель</div>
            </div>
            <div className="tabs" style={{ marginBottom: 0 }}>
              <div className="tab active">Нед.</div>
              <div className="tab">Мес.</div>
              <div className="tab">Год</div>
            </div>
          </div>
          <div id="dash-chart">
            <div className="chart-bars">
              {weeks.map((_, i) => (
                <div key={i} className={`bar ${i === 7 ? 'active' : ''}`} style={{ height: `${vals[i]}%` }}>
                  <div className="bar-tooltip">₽{(vals[i] * 2.84).toFixed(0)}K</div>
                </div>
              ))}
            </div>
            <div className="chart-labels">
              {weeks.map((w, i) => <div key={i} className="chart-label">{w}</div>)}
            </div>
          </div>
        </div>
        
        <div className="card">
          <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '16px' }}>Последние события</div>
          <div className="activity-item">
            <div className="activity-dot" style={{ background: '#FCAE91' }}></div>
            <div><div className="activity-text"><strong>Мария К.</strong> записалась на пилатес у Анны</div><div className="activity-time">2 мин. назад</div></div>
          </div>
          <div className="activity-item">
            <div className="activity-dot" style={{ background: '#5BAB72' }}></div>
            <div><div className="activity-text"><strong>Оплата ₽3 500</strong> от Елены Соколовой</div><div className="activity-time">14 мин. назад</div></div>
          </div>
          <div className="activity-item">
            <div className="activity-dot" style={{ background: '#4A80C4' }}></div>
            <div><div className="activity-text"><strong>Дмитрий П.</strong> активировал абонемент на 10 занятий</div><div className="activity-time">38 мин. назад</div></div>
          </div>
          <div className="activity-item">
            <div className="activity-dot" style={{ background: '#D88C9A' }}></div>
            <div><div className="activity-text"><strong>Отмена записи</strong> — Наталья Б. (18:00)</div><div className="activity-time">1 час назад</div></div>
          </div>
          <div className="activity-item">
            <div className="activity-dot" style={{ background: '#f0c040' }}></div>
            <div><div className="activity-text"><strong>Новый VIP клиент</strong> — Алексей Морозов</div><div className="activity-time">2 часа назад</div></div>
          </div>
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