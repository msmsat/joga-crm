import React, { useState } from 'react';

// ─── ЛОКАЛЬНЫЕ ДАННЫЕ СТРАНИЦЫ (Mock Data) ────────────────────────────────────
const jDays = ['Анна Н.', 'Дарья П.', 'Михаил В.', 'Ольга С.', 'Иван К.', 'Дарья П.2'];
const jTimes = ['08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00', '21:00'];
const jColors = [
  'rgba(252,174,145,0.4)', 'rgba(91,171,114,0.35)', 'rgba(64,168,160,0.35)', 
  'rgba(74,128,196,0.35)', 'rgba(123,108,212,0.35)', 'rgba(224,128,96,0.35)'
];

const jBookings: Record<string, string> = {
  '0_2': 'Пилатес', '0_4': 'Пил. advanced', '0_7': 'Персональный', '0_11': 'Вечерний',
  '1_1': 'Йога Хатха', '1_5': 'Флоу', '1_9': 'Аштанга',
  '2_3': 'Стретчинг', '2_6': 'Стретч+', '2_10': 'Вечер',
  '3_0': 'Открытие', '3_8': 'Планёрка',
  '4_2': 'Фитбол', '4_7': 'Роллинг',
  '5_4': 'Детский', '5_9': 'Спина',
};

const monthNames = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];

// ─── ГЛАВНЫЙ КОМПОНЕНТ ────────────────────────────────────────────────────────
export default function Journal() {
  // ─── СОСТОЯНИЯ КАЛЕНДАРЯ И ФИЛЬТРОВ ───
  const [calMonth, setCalMonth] = useState(5); // Июнь (индекс 5)
  const [calYear, setCalYear] = useState(2025);

  const [jFilters, setJFilters] = useState<Record<string, boolean>>({
    'Все тренеры': true, 'Анна Н.': false, 'Дарья П.': false, 'Михаил В.': false
  });
  
  const [jHalls, setJHalls] = useState<Record<string, boolean>>({
    'Зал 1': true, 'Зал 2': false, 'Студия': false, 'Онлайн': false
  });

  // ─── ФУНКЦИИ УПРАВЛЕНИЯ ───
  const changeMonth = (dir: number) => {
    let newMonth = calMonth + dir;
    let newYear = calYear;
    if (newMonth > 11) { newMonth = 0; newYear++; }
    if (newMonth < 0) { newMonth = 11; newYear--; }
    setCalMonth(newMonth);
    setCalYear(newYear);
  };

  const toggleJFilter = (name: string) => setJFilters(prev => ({ ...prev, [name]: !prev[name] }));
  const toggleJHall = (name: string) => setJHalls(prev => ({ ...prev, [name]: !prev[name] }));

  // ─── ВЫЧИСЛЕНИЯ ДЛЯ МИНИ-КАЛЕНДАРЯ ───
  const firstDay = new Date(calYear, calMonth, 1).getDay();
  const offset = (firstDay === 0) ? 6 : firstDay - 1; // Смещение первого дня недели
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const calendarDays = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  return (
    // Обертка с жесткой высотой для корректного скролла сетки
    <div style={{ height: 'calc(100vh - 56px - 56px)' }}>
      <div className="journal-layout">
        
        {/* ─── ЛЕВАЯ ЧАСТЬ (СЕТКА РАСПИСАНИЯ) ─── */}
        <div className="journal-main">
          {/* Панель инструментов (Тулбар) */}
          <div className="journal-toolbar">
            <div style={{ fontSize: '13px', fontWeight: 700 }}>Журнал · Сегодня</div>
            
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', flex: 1 }}>
              {['Все тренеры', 'Анна Н.', 'Дарья П.', 'Михаил В.'].map(f => (
                <div 
                  key={f} 
                  className={`filter-pill ${jFilters[f] ? 'active' : ''}`} 
                  onClick={() => toggleJFilter(f)}
                >
                  {f}
                </div>
              ))}
            </div>
            
            <div style={{ display: 'flex', gap: '6px' }}>
              {['Зал 1', 'Зал 2', 'Студия'].map(f => (
                <div 
                  key={f} 
                  className={`filter-pill ${jHalls[f] ? 'active' : ''}`} 
                  onClick={() => toggleJHall(f)}
                >
                  {f}
                </div>
              ))}
            </div>
          </div>

          {/* Сетка расписания */}
          <div className="journal-grid-area">
            <div className="journal-grid">
              <div className="jg-head"></div>
              {jDays.map((d, i) => (
                <div key={i} className="jg-head" style={{ fontSize: '10px' }}>{d}</div>
              ))}
              
              {jTimes.map((t, ti) => (
                <React.Fragment key={ti}>
                  <div className="jg-time">{t}</div>
                  {[0, 1, 2, 3, 4, 5].map(d => {
                    const key = `${d}_${ti}`;
                    return jBookings[key] ? (
                      <div 
                        key={d} 
                        className="jg-cell booked" 
                        style={{ background: jColors[d], color: 'var(--text)', fontWeight: 600 }}
                      >
                        {jBookings[key]}
                      </div>
                    ) : (
                      <div key={d} className="jg-cell empty"></div>
                    );
                  })}
                </React.Fragment>
              ))}
            </div>
          </div>
        </div>

        {/* ─── ПРАВАЯ ЧАСТЬ (КАЛЕНДАРЬ И ЗАГРУЗКА) ─── */}
        <div className="journal-right">
          
          {/* Мини-календарь */}
          <div className="mini-cal">
            <div className="mini-cal-header">
              <button className="mc-btn" onClick={() => changeMonth(-1)}>‹</button>
              <div className="mc-title">{monthNames[calMonth]} {calYear}</div>
              <button className="mc-btn" onClick={() => changeMonth(1)}>›</button>
            </div>
            
            <div className="mini-cal-days">
              <div className="mcd">Пн</div><div className="mcd">Вт</div><div className="mcd">Ср</div>
              <div className="mcd">Чт</div><div className="mcd">Пт</div><div className="mcd">Сб</div><div className="mcd">Вс</div>
              
              <div style={{ gridColumn: '1/-1', display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: '2px' }}>
                {Array.from({ length: offset }).map((_, i) => <div key={`empty-${i}`}></div>)}
                {calendarDays.map(d => {
                  const isToday = (d === 30 && calMonth === 5 && calYear === 2025);
                  const hasEvent = [3, 8, 12, 17, 24, 28].includes(d);
                  return (
                    <div 
                      key={d} 
                      className={`mcday ${isToday ? 'today' : ''} ${hasEvent && !isToday ? 'has-event' : ''}`}
                    >
                      {d}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
          
          <div style={{ height: '1px', background: 'var(--border)', margin: '14px 0' }}></div>
          
          {/* Выбор зала */}
          <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px' }}>
            Залы
          </div>
          <div className="hall-select">
            {['Зал 1', 'Зал 2', 'Студия', 'Онлайн'].map(f => (
              <div 
                key={f} 
                className={`hall-chip ${jHalls[f] ? 'active' : ''}`} 
                onClick={() => toggleJHall(f)}
              >
                {f}
              </div>
            ))}
          </div>

          <div style={{ height: '1px', background: 'var(--border)', margin: '14px 0' }}></div>
          
          {/* Загрузка тренеров (Анимация баров) */}
          <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px' }}>
            Загрузка тренеров
          </div>
          <div>
            {[
              ['АН', '#5BAB72', 'Анна Н.', 94], 
              ['ДП', '#e08060', 'Дарья П.', 81], 
              ['МВ', '#40a8a0', 'Михаил В.', 68], 
              ['ОС', '#4A80C4', 'Ольга С.', 45]
            ].map(([i, c, n, p], idx) => (
              <div key={idx} className="staff-load-item">
                <div className="sli-top">
                  <div className="sli-ava" style={{ background: c as string }}>{i}</div>
                  <div className="sli-name">{n}</div>
                  <div className="sli-pct">{p}%</div>
                </div>
                <div className="sli-bar">
                  <div className="sli-fill" style={{ width: `${p}%`, background: c as string }}></div>
                </div>
              </div>
            ))}
          </div>
          
        </div>
      </div>
    </div>
  );
}