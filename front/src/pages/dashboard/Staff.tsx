import React, { useState } from 'react';
import type { MouseEvent } from 'react';
import AddStaffModal from '../../components/modals/AddStaffModal'; // 🔥 ВЫХОДИМ НА 2 УРОВНЯ ВВЕРХ
import EditStaffModal from '../../components/modals/EditStaffModal'; // 🔥 Импортируем модалку редактирования
import { PrimaryButton } from '../../components/UI';

// ─── БАЗЫ ДАННЫХ И КОНФИГУРАЦИЯ (Словари) ────────────────────────────────────
const halls: Record<string, { name: string, color: string }> = {
  A: { name: 'Зал А', color: '#5BAB72' },
  B: { name: 'Зал Б', color: '#4A80C4' },
  C: { name: 'Студия С', color: '#e08060' }
};

const times = ['08:00', '10:00', '12:00', '14:00', '16:00', '18:00', '20:00'];
const days = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

// Исходные данные сотрудников (расширенные из вашего HTML)
const initialStaff = [
  { id: 'owner', group: 'Владелец', name: 'Алексей Морозов', role: 'Владелец студии', initials: 'АМ', grad: 'linear-gradient(135deg,#FCAE91,#f5887a)', bg: 'linear-gradient(135deg,rgba(252,174,145,.15),rgba(249,160,139,.08))', stats: [{ v: '₽284K', l: 'Выручка' }, { v: '5.0★', l: 'Рейтинг' }, { v: '9', l: 'Сотрудников' }, { v: '142', l: 'Клиентов' }], online: true, phone: '+7 900 123-45-67', email: 'alex@velora.studio' },
  { id: 'admin1', group: 'Администраторы', name: 'Ольга Смирнова', role: 'Администратор', initials: 'ОС', grad: 'linear-gradient(135deg,#4A80C4,#3a6ab0)', bg: 'linear-gradient(135deg,rgba(74,128,196,.1),rgba(74,128,196,.05))', stats: [{ v: '148', l: 'Записей' }, { v: '₽42K', l: 'Зарплата' }, { v: '4.8★', l: 'Рейтинг' }, { v: '98%', l: 'Точность' }], online: true, phone: '+7 916 234-56-78', email: 'olga@velora.studio' },
  { id: 'admin2', group: null, name: 'Иван Коваль', role: 'Администратор', initials: 'ИК', grad: 'linear-gradient(135deg,#7b6cd4,#6050b8)', bg: 'linear-gradient(135deg,rgba(123,108,212,.1),rgba(123,108,212,.05))', stats: [{ v: '96', l: 'Записей' }, { v: '₽38K', l: 'Зарплата' }, { v: '4.7★', l: 'Рейтинг' }, { v: '95%', l: 'Точность' }], online: false, phone: '+7 921 345-67-89', email: 'ivan@velora.studio' },
  { id: 'trainer1', group: 'Тренеры', name: 'Анна Новикова', role: 'Тренер пилатеса', initials: 'АН', grad: 'linear-gradient(135deg,#5BAB72,#4a9060)', bg: 'linear-gradient(135deg,rgba(91,171,114,.12),rgba(91,171,114,.05))', stats: [{ v: '312', l: 'Записи' }, { v: '₽65K', l: 'Зарплата' }, { v: '4.9★', l: 'Рейтинг' }, { v: '94%', l: 'Загрузка' }], online: true, phone: '+7 903 456-78-90', email: 'anna@velora.studio' },
  { id: 'trainer2', group: null, name: 'Дарья Петрова', role: 'Тренер йоги', initials: 'ДП', grad: 'linear-gradient(135deg,#e08060,#c86040)', bg: 'linear-gradient(135deg,rgba(224,128,96,.1),rgba(224,128,96,.05))', stats: [{ v: '248', l: 'Записи' }, { v: '₽58K', l: 'Зарплата' }, { v: '4.8★', l: 'Рейтинг' }, { v: '81%', l: 'Загрузка' }], online: true, phone: '+7 905 567-89-01', email: 'darya@velora.studio' },
  { id: 'trainer3', group: null, name: 'Михаил Волков', role: 'Тренер стретчинга', initials: 'МВ', grad: 'linear-gradient(135deg,#40a8a0,#2d8880)', bg: 'linear-gradient(135deg,rgba(64,168,160,.1),rgba(64,168,160,.05))', stats: [{ v: '186', l: 'Записи' }, { v: '₽48K', l: 'Зарплата' }, { v: '4.7★', l: 'Рейтинг' }, { v: '68%', l: 'Загрузка' }], online: false, phone: '+7 909 678-90-12', email: 'misha@velora.studio' }
];

// ─── ГЛАВНЫЙ КОМПОНЕНТ ────────────────────────────────────────────────────────
export default function Staff() {
  // 1. СТЕЙТЫ (State)
  const [activeStaffId, setActiveStaffId] = useState('trainer1');
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [dontAskDelete, setDontAskDelete] = useState(false);
  
  // Управление модалкой (Типизировано для безопасности)
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  const [modal, setModal] = useState<{ 
    isOpen: boolean; 
    title: string; 
    sub: string; 
    type?: string; 
    danger?: boolean; 
    confirmText?: string; 
    phone?: string; // 🔥 Добавили проп для телефона
    onConfirm?: () => void; 
  }>({ isOpen: false, title: '', sub: '' });

  // Данные расписания и событий (Иммутабельные)
  const [schedules, setSchedules] = useState<Record<string, number[][]>>({
    trainer1: [[0,1,0,1,0,1,0],[1,0,1,0,1,1,0],[1,1,0,1,0,1,0],[0,1,1,0,1,0,1],[1,0,1,1,0,1,1],[0,1,0,1,1,0,1],[1,1,1,0,0,1,0]],
    trainer2: [[1,0,1,0,1,0,0],[0,1,0,1,0,1,1],[1,0,1,1,0,0,1],[1,1,0,0,1,1,0],[0,0,1,1,1,0,1],[1,1,0,0,0,1,1],[0,1,1,1,0,1,0]],
    trainer3: [[0,1,0,0,1,0,1],[1,0,1,0,0,1,0],[0,1,0,1,1,0,1],[1,0,1,0,1,1,0],[0,1,1,1,0,0,1],[1,0,0,1,1,1,0],[0,1,0,0,1,0,1]],
    admin1: [[1,0,1,1,0,1,0],[0,1,0,1,1,0,0],[1,1,1,0,0,1,0],[0,0,1,1,0,0,1],[1,0,0,1,1,1,0],[0,1,1,0,0,1,0],[1,1,0,1,0,1,1]],
    admin2: [[0,1,0,1,0,0,1],[1,0,1,0,1,1,0],[0,1,1,0,1,0,1],[1,1,0,1,0,1,0],[0,0,1,0,1,0,1],[1,0,0,1,1,0,1],[0,1,1,0,0,1,0]]
  });

  const [upcoming, setUpcoming] = useState<Record<string, any[]>>({
    trainer1: [{time:'09:00',dur:'60',name:'Пилатес (начинающие)',clients:8,hall:'A',color:'#5BAB72'},{time:'11:00',dur:'60',name:'Пилатес (продвинутые)',clients:6,hall:'B',color:'#4A80C4'},{time:'14:00',dur:'45',name:'Частная тренировка',clients:1,hall:'C',color:'#e08060'},{time:'16:30',dur:'60',name:'Пилатес (группа)',clients:9,hall:'A',color:'#5BAB72'}],
    trainer2: [{time:'10:00',dur:'60',name:'Хатха-йога',clients:10,hall:'B',color:'#4A80C4'},{time:'12:00',dur:'75',name:'Йога-нидра',clients:7,hall:'A',color:'#5BAB72'},{time:'18:00',dur:'60',name:'Вечерняя йога',clients:12,hall:'C',color:'#e08060'}],
    trainer3: [{time:'08:00',dur:'60',name:'Утренний стретчинг',clients:6,hall:'C',color:'#e08060'},{time:'13:00',dur:'60',name:'Глубокий стретчинг',clients:8,hall:'A',color:'#5BAB72'},{time:'19:00',dur:'90',name:'Гибкость и растяжка',clients:5,hall:'B',color:'#4A80C4'}],
    admin1: [{time:'09:00',dur:'480',name:'Смена администратора',clients:null,hall:'A',color:'#4A80C4'}],
    owner: [{time:'11:00',dur:'60',name:'Финансовый отчёт',clients:null,hall:'A',color:'#FCAE91'}]
  });

  // Тултип для графика
  const [tooltip, setTooltip] = useState({ show: false, x: 0, y: 0, title: '', sub: '' });

  // 2. ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
  const activeStaff = initialStaff.find(s => s.id === activeStaffId)!;
  const isOwner = activeStaff.id === 'owner';
  const isTrainer = activeStaff.id.startsWith('trainer');
  const loadValue = parseInt(activeStaff.stats.find(x => x.l === 'Загрузка')?.v || '0');

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 2500);
  };

  const closeModal = () => setModal({ ...modal, isOpen: false });

  // 3. ОБРАБОТЧИКИ СОБЫТИЙ
  const toggleSlot = (ti: number, di: number) => {
    const isBooked = schedules[activeStaffId]?.[ti]?.[di];
    if (isBooked) {
      // Если пользователь просил больше не спрашивать — удаляем сразу
      if (dontAskDelete) {
        const newSch = { ...schedules };
        newSch[activeStaffId][ti][di] = 0;
        setSchedules(newSch);
        showToast('Слот удалён');
        return;
      }

      setModal({
        isOpen: true, title: 'Удалить слот из графика?', sub: `${times[ti]} · ${days[di]} — убрать выбранное время?`, type: 'ALERT', danger: true, confirmText: 'Удалить',
        onConfirm: () => {
          const newSch = { ...schedules };
          newSch[activeStaffId][ti][di] = 0;
          setSchedules(newSch);
          showToast('Слот удалён');
        }
      });
    } else {
      const newSch = { ...schedules };
      if (!newSch[activeStaffId]) {
        newSch[activeStaffId] = Array(7).fill(null).map(() => Array(7).fill(0));
      }
      newSch[activeStaffId][ti][di] = 1;
      setSchedules(newSch);
      showToast('Слот добавлен');
    }
  };

  const clearSchedule = () => {
    setModal({
      isOpen: true, title: 'Очистить график?', sub: 'Все слоты на неделю будут удалены.', type: 'ALERT', danger: true, confirmText: 'Очистить',
      onConfirm: () => {
        const newSch = { ...schedules };
        newSch[activeStaffId] = Array(7).fill(null).map(() => Array(7).fill(0));
        setSchedules(newSch);
        showToast('График очищен');
      }
    });
  };

  const fillSchedule = () => {
    const newSch = { ...schedules };
    newSch[activeStaffId] = Array(7).fill(null).map(() => Array(7).fill(null).map(() => Math.random() > 0.45 ? 1 : 0));
    setSchedules(newSch);
    showToast('График заполнен автоматически');
  };

  const handleMouseEnterSlot = (e: MouseEvent, ti: number, di: number) => {
    const isBooked = schedules[activeStaffId]?.[ti]?.[di];
    setTooltip({
      show: true,
      x: e.clientX + 12,
      y: e.clientY - 40,
      title: `${times[ti]} · ${days[di]}`,
      sub: isBooked ? 'Нажмите чтобы убрать' : 'Нажмите чтобы добавить слот'
    });
  };

  // 4. РЕНДЕР
  return (
    <div style={{ height: 'calc(100vh - 56px - 56px)' }}>
      <div className="staff-layout">
        
        {/* ЛЕВАЯ ПАНЕЛЬ: СПИСОК КОМАНДЫ */}
        <div className="staff-list-panel">
          <div className="panel-hdr">
            <span className="panel-title">Команда · {initialStaff.length} чел.</span>
            <button className="add-btn" onClick={() => setIsModalOpen(true)} title="Добавить сотрудника">+</button>
          </div>
          
          <div className="staff-list">
            {initialStaff.map((s, i) => (
              <React.Fragment key={s.id}>
                {/* Рендерим заголовок группы, если он изменился */}
                {(i === 0 || initialStaff[i - 1].group !== s.group) && s.group && (
                  <div className="role-sep">{s.group}</div>
                )}
                
                <div className={`s-item ${activeStaffId === s.id ? 'active' : ''}`} onClick={() => setActiveStaffId(s.id)}>
                  <div className={`ava ${s.online ? 'ava-online' : ''}`} style={{ background: s.grad, width: '40px', height: '40px', fontSize: '13px' }}>{s.initials}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="s-name" style={{ fontSize: '13px' }}>{s.name.split(' ')[0]} {s.name.split(' ')[1] ? s.name.split(' ')[1][0] + '.' : ''}</div>
                    <div className="s-role" style={{ fontSize: '11px', marginTop: '1px' }}>{s.role}</div>
                  </div>
                  {s.online && <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#A3C9A8', flexShrink: 0 }}></div>}
                </div>
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* ПРАВАЯ ПАНЕЛЬ: ПРОФИЛЬ */}
        <div className="premium-right">
          <div className="premium-hero" style={{ height: '160px' }}>
            <div className="hero-bg" style={{ background: activeStaff.bg }}></div>
            
            <div className="hero-actions">
              <button className="h-btn" onClick={() => setModal({ isOpen: true, title: `Написать ${activeStaff.name.split(' ')[0]}`, sub: 'Сообщение уйдет в рабочий чат', type: 'PROMPT_MESSAGE', confirmText: 'Отправить', onConfirm: () => showToast('Сообщение отправлено') })}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                Написать
              </button>
              <button 
                className="h-btn" 
                onClick={() => setModal({ 
                  isOpen: true, 
                  title: `Связаться: ${activeStaff.name.split(' ')[0]}`, 
                  sub: 'Выберите удобный способ связи', 
                  type: 'PROMPT_CALL',
                  phone: activeStaff.phone
                })}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.99 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.92 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 8.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                Звонок
              </button>
              {/* 🔥 Теперь используем наш умный компонент PrimaryButton 🔥 */}
              {!isOwner && (
                <PrimaryButton 
                  style={{ padding: '10px 24px' }} 
                  onClick={() => setIsEditModalOpen(true)} // 🔥 Открываем модалку по клику
                >
                  Изменить
                </PrimaryButton>
              )}
            </div>

            <div className="hero-info">
              <div className="hero-ava" style={{ background: activeStaff.grad }}>
                {activeStaff.initials}
                {activeStaff.online && <div className="badge-online"></div>}
              </div>
              <div>
                <div className="hero-name">{activeStaff.name}</div>
                <div className="hero-role">{activeStaff.role} {activeStaff.online ? <span style={{ color: '#5BAB72', fontWeight: 700 }}>· онлайн</span> : '· офлайн'}</div>
              </div>
            </div>
          </div>

          <div className="premium-body fade-in" key={activeStaff.id}>
            
            {/* Карточки Статистики */}
            <div className="stats-row" style={{ gridTemplateColumns: `repeat(${activeStaff.stats.length}, 1fr)` }}>
              {activeStaff.stats.map((st, idx) => (
                <div key={idx} className="stat-card">
                  <div className="stat-v">{st.v}</div>
                  <div className="stat-l">{st.l}</div>
                </div>
              ))}
            </div>

            {/* Чипы Информации */}
            <div className="info-row">
              <div className="chip status-on">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                Активен
              </div>
              <div className="chip" onClick={() => showToast('Email скопирован')}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                {activeStaff.email}
              </div>
              <div className="chip" onClick={() => showToast('Звоним...')}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.99 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.92 1h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 8.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                {activeStaff.phone}
              </div>
            </div>

            {/* Спец-блок для Владельца */}
            {isOwner && (
              <div className="owner-card">
                <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                  Полный доступ
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text2)', marginBottom: '2px' }}>Владелец имеет доступ ко всем модулям системы</div>
                <div className="owner-perm">
                  {['Финансы', 'Сотрудники', 'Отчёты', 'Клиенты', 'Настройки'].map(p => <span key={p} className="perm-badge">{p}</span>)}
                </div>
              </div>
            )}

            {/* Бар Загрузки для Тренера */}
            {isTrainer && loadValue > 0 && (
              <div className="load-bar-wrap" style={{ marginTop: '4px' }}>
                <div className="load-bar-top"><span className="load-bar-label">Загрузка тренера</span><span className="load-bar-pct">{loadValue}%</span></div>
                <div className="load-bar-bg">
                  <div className="load-bar-fill" style={{ width: `${loadValue}%`, background: loadValue > 85 ? '#5BAB72' : loadValue > 60 ? '#FCAE91' : '#D88C9A' }}></div>
                </div>
              </div>
            )}

            {/* СЕТКА РАСПИСАНИЯ */}
            {!isOwner && schedules[activeStaffId] && (
              <>
                <div className="sec-title">
                  <span>График на неделю</span>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button className="sch-action-btn btn-clear-sch" onClick={clearSchedule}>Очистить</button>
                    <button className="sch-action-btn btn-magic-sch" onClick={fillSchedule}>Авто-заполнить</button>
                  </div>
                </div>
                
                <div className="sch-wrap">
                  <div className="sch-top">
                    <div className="day-tabs">
                      <div className="day-tab active">Неделя</div>
                      <div className="day-tab">Месяц</div>
                    </div>
                    <span className="week-label">2–8 июня 2026</span>
                  </div>
                  
                  <div className="sch-grid">
                    <div className="sch-head"></div>
                    {days.map((d, i) => <div key={i} className="sch-head">{d}</div>)}
                    
                    {times.map((t, ti) => (
                      <React.Fragment key={ti}>
                        <div className="sch-time">{t}</div>
                        {[0, 1, 2, 3, 4, 5, 6].map(di => {
                          const booked = schedules[activeStaffId][ti][di];
                          return (
                            <div 
                              key={di} 
                              className={`sch-cell ${booked ? 'booked' : ''}`}
                              onMouseEnter={(e) => handleMouseEnterSlot(e, ti, di)}
                              onMouseLeave={() => setTooltip({ ...tooltip, show: false })}
                              onClick={() => toggleSlot(ti, di)}
                            ></div>
                          );
                        })}
                      </React.Fragment>
                    ))}
                  </div>
                  
                  <div className="sch-legend">
                    {Object.values(halls).map((h, i) => (
                      <div key={i} className="leg"><div className="leg-dot" style={{ background: h.color }}></div>{h.name}</div>
                    ))}
                    <div className="leg"><div className="leg-dot" style={{ background: 'rgba(252,174,145,.12)', border: '1px solid var(--border2)' }}></div>Свободно</div>
                  </div>
                </div>
              </>
            )}

            {/* БЛИЖАЙШИЕ ЗАПИСИ (UPCOMING) */}
            {upcoming[activeStaffId]?.length > 0 && (
              <>
                <div className="sec-title" style={{ marginTop: '24px' }}>
                  <span>Расписание сегодня</span>
                  <button className="sch-action-btn btn-add-event" onClick={() => showToast('Форма добавления...')}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginRight: '4px' }}><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                    Добавить
                  </button>
                </div>
                <div className="upcoming-list">
                  {upcoming[activeStaffId].map((u, i) => (
                    <div key={i} className="upcoming-item">
                      <div className="up-time">
                        <div className="up-time-h">{u.time}</div>
                        <div className="up-time-m">{u.dur} мин</div>
                      </div>
                      <div className="up-dot" style={{ background: u.color }}></div>
                      <div className="up-info">
                        <div className="up-name">{u.name}</div>
                        <div className="up-sub">{u.clients ? `${u.clients} клиентов · ` : ''} {halls[u.hall]?.name || ''}</div>
                      </div>
                      <div className="up-hall" style={{ background: `${u.color}18`, color: u.color }}>Зал {u.hall}</div>
                      <div className="up-actions">
                        <button className="up-icon-btn del" onClick={() => {
                           if (dontAskDelete) {
                              const newUp = { ...upcoming };
                              newUp[activeStaffId].splice(i, 1);
                              setUpcoming(newUp);
                              showToast('Занятие удалено');
                              return;
                           }
                           setModal({
                            isOpen: true, title: 'Удалить занятие?', sub: `${u.name} · ${u.time}`, type: 'ALERT', danger: true, confirmText: 'Удалить',
                            onConfirm: () => {
                              const newUp = { ...upcoming };
                              newUp[activeStaffId].splice(i, 1);
                              setUpcoming(newUp);
                              showToast('Занятие удалено');
                            }
                          });
                        }}>
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
            
          </div>
        </div>
      </div>

      {/* ПОРТАЛЫ: ТУЛТИП, МОДАЛКА, ТОСТ */}
      {tooltip.show && (
        <div className="slot-tip show" style={{ left: tooltip.x, top: tooltip.y }}>
          <span style={{ fontWeight: 700 }}>{tooltip.title}</span>
          <span className="slot-sub">{tooltip.sub}</span>
        </div>
      )}

      <div className={`modal-overlay ${modal.isOpen ? 'open' : ''}`} onClick={closeModal}>
        <div className="modal" onClick={e => e.stopPropagation()}>
          <div className="modal-title">{modal.title}</div>
          <div className="modal-sub">{modal.sub}</div>
          
          {modal.type === 'PROMPT_MESSAGE' && (
            <textarea className="modal-textarea" placeholder="Введите сообщение..."></textarea>
          )}

          {modal.type === 'PROMPT_CALL' && (
            <div className="call-options-wrap">
              
              <div className="call-opt-card" onClick={() => { closeModal(); showToast('Начинаем звонок...'); }}>
                <div className="call-opt-icon" style={{ background: 'rgba(74,128,196,0.1)', color: '#4A80C4' }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.99 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.92 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 8.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                </div>
                <div className="call-opt-text">
                  <div className="call-opt-title">Обычный звонок</div>
                  <div className="call-opt-sub">{modal.phone}</div>
                </div>
                <div className="call-opt-arrow">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="9 18 15 12 9 6"/></svg>
                </div>
              </div>

              <div className="call-opt-card" onClick={() => { closeModal(); showToast('Открываем WhatsApp...'); }}>
                <div className="call-opt-icon" style={{ background: 'rgba(91,171,114,0.12)', color: '#5BAB72' }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
                </div>
                <div className="call-opt-text">
                  <div className="call-opt-title">Написать в WhatsApp</div>
                  <div className="call-opt-sub">Перейти в мессенджер</div>
                </div>
                <div className="call-opt-arrow">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="9 18 15 12 9 6"/></svg>
                </div>
              </div>

            </div>
          )}

          {modal.danger && (
            <div className="dont-ask-wrapper">
              <label className="custom-checkbox-wrapper" style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                <input 
                  type="checkbox" 
                  checked={dontAskDelete} 
                  onChange={(e) => setDontAskDelete(e.target.checked)}
                  style={{ display: 'none' }}
                />
                <div className={`custom-checkbox-box ${dontAskDelete ? 'checked' : ''}`}>
                  {dontAskDelete && (
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                  )}
                </div>
                <span className="dont-ask-text">Больше не спрашивать при удалении</span>
              </label>
            </div>
          )}

          <div className="modal-btns" style={modal.type === 'PROMPT_CALL' ? { marginTop: '16px' } : {}}>
            {modal.type === 'PROMPT_CALL' ? (
              /* Для выбора способа связи нужна только кнопка Закрыть на всю ширину */
              <button className="mbtn cancel" style={{ width: '100%', margin: 0 }} onClick={closeModal}>Отмена</button>
            ) : (
              /* Стандартные кнопки для других модалок */
              <>
                <button className="mbtn cancel" onClick={closeModal}>Отмена</button>
                {modal.confirmText && (
                  <button className={`mbtn ${modal.danger ? 'danger' : 'confirm'}`} onClick={modal.onConfirm}>
                    {modal.confirmText}
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      <div className={`toast ${toastMsg ? 'show' : ''}`}>
        {toastMsg}
      </div>

      <AddStaffModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        onSuccess={(data: any) => {
          console.log("Данные нового сотрудника:", data);
          showToast(`Сотрудник ${data.name.split(' ')[0]} добавлен 🎉`);
        }}
      />

      <EditStaffModal
        isOpen={isEditModalOpen}
        staff={activeStaff as any} // Передаем активного сотрудника
        onClose={() => setIsEditModalOpen(false)}
        onSave={(updatedData) => {
          console.log("Сохраненные данные:", updatedData);
          showToast(`Изменения профиля "${updatedData.name}" сохранены`);
          // Здесь в будущем будет логика обновления стейта или отправки на бэк
        }}
        onDelete={(id) => {
          console.log("Сотрудник удален:", id);
          showToast("Сотрудник успешно удален");
        }}
      />

    </div>
  );
}