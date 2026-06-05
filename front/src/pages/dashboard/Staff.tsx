import React, { useState } from 'react';

// ─── ТИПЫ И ДАННЫЕ ────────────────────────────────────────────────────────────
interface StaffData {
  name: string; role: string; initials: string; color: string; bg: string; stats: string[];
}

const staffData: Record<string, StaffData> = {
  owner: { name: 'Алексей Морозов', role: 'Владелец студии', initials: 'АМ', color: 'linear-gradient(135deg,#FCAE91,#f5887a)', bg: 'linear-gradient(135deg,rgba(252,174,145,0.15) 0%,rgba(249,160,139,0.08) 100%)', stats: ['284', '₽—', '5.0★', '—'] },
  admin1: { name: 'Ольга Смирнова', role: 'Администратор', initials: 'ОС', color: 'linear-gradient(135deg,#4A80C4,#3a6ab0)', bg: 'linear-gradient(135deg,rgba(74,128,196,0.1) 0%,rgba(74,128,196,0.05) 100%)', stats: ['148', '₽42K', '4.8★', '78%'] },
  admin2: { name: 'Иван Коваль', role: 'Администратор', initials: 'ИК', color: 'linear-gradient(135deg,#7b6cd4,#6050b8)', bg: 'linear-gradient(135deg,rgba(123,108,212,0.1) 0%,rgba(123,108,212,0.05) 100%)', stats: ['96', '₽38K', '4.7★', '62%'] },
  trainer1: { name: 'Анна Новикова', role: 'Тренер пилатеса', initials: 'АН', color: 'linear-gradient(135deg,#5BAB72,#4a9060)', bg: 'linear-gradient(135deg,rgba(91,171,114,0.1) 0%,rgba(91,171,114,0.05) 100%)', stats: ['312', '₽65K', '4.9★', '94%'] },
  trainer2: { name: 'Дарья Петрова', role: 'Тренер йоги', initials: 'ДП', color: 'linear-gradient(135deg,#e08060,#c86040)', bg: 'linear-gradient(135deg,rgba(224,128,96,0.1) 0%,rgba(224,128,96,0.05) 100%)', stats: ['248', '₽58K', '4.8★', '81%'] },
  trainer3: { name: 'Михаил Волков', role: 'Тренер стретчинга', initials: 'МВ', color: 'linear-gradient(135deg,#40a8a0,#2d8880)', bg: 'linear-gradient(135deg,rgba(64,168,160,0.1) 0%,rgba(64,168,160,0.05) 100%)', stats: ['186', '₽48K', '4.7★', '68%'] },
};

// ─── КОМПОНЕНТ ────────────────────────────────────────────────────────────────
export default function Staff() {
  const [activeStaff, setActiveStaff] = useState('owner');

  return (
    <div style={{ height: 'calc(100vh - 56px - 56px)' }}>
      <div className="staff-layout">
        
        {/* ─── ЛЕВЫЙ САЙДБАР (СПИСОК СОТРУДНИКОВ) ─── */}
        <div className="staff-list-panel">
          <div className="staff-panel-header">Команда · 9 человек</div>
          <div className="staff-list">
            
            <div className="role-sep">Владелец</div>
            <div className={`staff-item ${activeStaff === 'owner' ? 'active' : ''}`} onClick={() => setActiveStaff('owner')}>
              <div className="staff-ava" style={{ background: 'linear-gradient(135deg,#FCAE91,#f5887a)' }}>АМ</div>
              <div className="staff-info"><div className="name">Алексей Морозов</div><div className="role">Владелец</div></div>
            </div>
            
            <div className="role-sep">Администраторы</div>
            <div className={`staff-item ${activeStaff === 'admin1' ? 'active' : ''}`} onClick={() => setActiveStaff('admin1')}>
              <div className="staff-ava" style={{ background: 'linear-gradient(135deg,#4A80C4,#3a6ab0)' }}>ОС</div>
              <div className="staff-info"><div className="name">Ольга Смирнова</div><div className="role">Администратор</div></div>
            </div>
            <div className={`staff-item ${activeStaff === 'admin2' ? 'active' : ''}`} onClick={() => setActiveStaff('admin2')}>
              <div className="staff-ava" style={{ background: 'linear-gradient(135deg,#7b6cd4,#6050b8)' }}>ИК</div>
              <div className="staff-info"><div className="name">Иван Коваль</div><div className="role">Администратор</div></div>
            </div>
            
            <div className="role-sep">Тренеры</div>
            <div className={`staff-item ${activeStaff === 'trainer1' ? 'active' : ''}`} onClick={() => setActiveStaff('trainer1')}>
              <div className="staff-ava" style={{ background: 'linear-gradient(135deg,#5BAB72,#4a9060)' }}>АН</div>
              <div className="staff-info"><div className="name">Анна Новикова</div><div className="role">Тренер пилатеса</div></div>
            </div>
            <div className={`staff-item ${activeStaff === 'trainer2' ? 'active' : ''}`} onClick={() => setActiveStaff('trainer2')}>
              <div className="staff-ava" style={{ background: 'linear-gradient(135deg,#e08060,#c86040)' }}>ДП</div>
              <div className="staff-info"><div className="name">Дарья Петрова</div><div className="role">Тренер йоги</div></div>
            </div>
            <div className={`staff-item ${activeStaff === 'trainer3' ? 'active' : ''}`} onClick={() => setActiveStaff('trainer3')}>
              <div className="staff-ava" style={{ background: 'linear-gradient(135deg,#40a8a0,#2d8880)' }}>МВ</div>
              <div className="staff-info"><div className="name">Михаил Волков</div><div className="role">Тренер стретчинга</div></div>
            </div>

          </div>
        </div>

        {/* ─── ПРАВАЯ ЧАСТЬ (ПРОФИЛЬ ВЫБРАННОГО СОТРУДНИКА) ─── */}
        <div className="staff-detail">
          <div className="staff-hero">
            <div className="staff-hero-bg" style={{ background: staffData[activeStaff].bg }}></div>
            <div className="staff-hero-info">
              <div className="staff-hero-ava" style={{ background: staffData[activeStaff].color }}>
                {staffData[activeStaff].initials}
              </div>
              <div>
                <div className="staff-hero-name">{staffData[activeStaff].name}</div>
                <div className="staff-hero-role">{staffData[activeStaff].role}</div>
              </div>
            </div>
          </div>
          
          <div className="staff-body">
            <div className="staff-stats">
              {staffData[activeStaff].stats.map((v, i) => (
                <div key={i} className="staff-stat">
                  <div className="v">{v}</div>
                  <div className="l">{['Записи', 'Зарплата', 'Рейтинг', 'Загрузка'][i]}</div>
                </div>
              ))}
            </div>
            
            <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text3)', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              График работы на неделю
            </div>
            
            <div className="schedule-grid">
              {['', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((d, i) => (
                <div key={i} className="sch-head">{d}</div>
              ))}
              
              {['08:00', '10:00', '12:00', '14:00', '16:00', '18:00', '20:00'].map((h, hi) => {
                const booked = [
                  [1,0,1,1,0,1,0],
                  [0,1,0,1,1,0,0],
                  [1,1,1,0,1,1,0],
                  [0,0,1,1,0,0,1],
                  [1,0,0,1,1,1,0],
                  [0,1,1,0,0,1,0],
                  [1,1,0,1,0,1,1]
                ];
                return (
                  <React.Fragment key={hi}>
                    <div className="sch-time">{h}</div>
                    {[0, 1, 2, 3, 4, 5, 6].map(d => (
                      <div key={d} className={`sch-cell ${booked[hi][d] ? 'booked' : ''}`}></div>
                    ))}
                  </React.Fragment>
                );
              })}
            </div>
          </div>
        </div>
        
      </div>
    </div>
  );
}