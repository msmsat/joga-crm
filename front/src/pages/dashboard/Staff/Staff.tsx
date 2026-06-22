import React, { useState } from 'react';
import type { MouseEvent } from 'react';
import './Staff.css';
import type { SchedulesMap, UpcomingMap, TooltipState } from './types';
import { halls, times, days, initialStaff } from './constants';
import { useStaffFilters } from './hooks/useStaffFilters';
import { StaffList }  from './components/StaffList';
import { StaffStats } from './components/StaffStats';
import { AddEmployeeModal }  from './components/modals/AddEmployeeModal';
import EditStaffModal from '../../../components/modals/EditStaffModal';
import { DeleteConfirmModal } from './components/modals/DeleteConfirmModal';

// ─── Local state types ────────────────────────────────────────────────────────

interface ActionModal {
  isOpen: boolean;
  title: string;
  sub: string;
  type?: 'PROMPT_MESSAGE' | 'PROMPT_CALL';
  phone?: string;
  onConfirm?: () => void;
}

interface DeleteModal {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  showDontAsk?: boolean;
  onConfirm: () => void;
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function Staff() {

  // ── Filters (search, groups) ──────────────────────────────────────────────
  const { staffList, searchQuery, setSearchQuery, activeGroup, setActiveGroup, availableGroups } =
    useStaffFilters(initialStaff);

  // ── Core UI state ─────────────────────────────────────────────────────────
  const [activeStaffId, setActiveStaffId] = useState('trainer1');
  const [toastMsg,      setToastMsg]      = useState<string | null>(null);
  const [dontAskDelete, setDontAskDelete] = useState(false);
  const [scheduleView,  setScheduleView]  = useState<'week' | 'month'>('week');

  // ── Employee modals ───────────────────────────────────────────────────────
  const [isAddModalOpen,  setIsAddModalOpen]  = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  // ── Action modal (non-destructive: write / call) ──────────────────────────
  const [actionModal, setActionModal] = useState<ActionModal>({ isOpen: false, title: '', sub: '' });
  const closeActionModal = () => setActionModal(m => ({ ...m, isOpen: false }));

  // ── Delete confirmation modal ─────────────────────────────────────────────
  const [deleteModal, setDeleteModal] = useState<DeleteModal>({
    isOpen: false, title: '', message: '', onConfirm: () => {},
  });
  const closeDeleteModal = () => setDeleteModal(m => ({ ...m, isOpen: false }));

  // ── Schedule data (13 rows × 7 days: 08:00–20:00 every hour) ─────────────
  const [schedules, setSchedules] = useState<SchedulesMap>({
    trainer1: [
      [0,1,0,1,0,1,0],[1,0,1,0,1,1,0],[1,1,0,1,0,1,0],[0,1,1,0,1,0,1],
      [1,0,1,1,0,1,1],[0,1,0,1,1,0,1],[1,1,1,0,0,1,0],[0,1,0,1,0,0,1],
      [1,0,1,0,1,1,0],[0,1,1,1,0,1,0],[1,1,0,0,1,0,1],[0,0,1,1,0,1,0],[1,0,0,1,1,0,1],
    ],
    trainer2: [
      [1,0,1,0,1,0,0],[0,1,0,1,0,1,1],[1,0,1,1,0,0,1],[1,1,0,0,1,1,0],
      [0,0,1,1,1,0,1],[1,1,0,0,0,1,1],[0,1,1,1,0,1,0],[1,0,0,1,1,0,1],
      [0,1,1,0,1,1,0],[1,0,1,0,0,1,1],[0,1,0,1,1,0,0],[1,0,1,0,1,0,1],[0,1,0,1,0,1,0],
    ],
    trainer3: [
      [0,1,0,0,1,0,1],[1,0,1,0,0,1,0],[0,1,0,1,1,0,1],[1,0,1,0,1,1,0],
      [0,1,1,1,0,0,1],[1,0,0,1,1,1,0],[0,1,0,0,1,0,1],[1,1,0,1,0,1,0],
      [0,0,1,0,1,0,1],[1,0,0,1,0,1,1],[0,1,1,0,1,0,0],[1,0,1,1,0,0,1],[0,1,0,0,1,1,0],
    ],
    admin1: [
      [1,0,1,1,0,1,0],[0,1,0,1,1,0,0],[1,1,1,0,0,1,0],[0,0,1,1,0,0,1],
      [1,0,0,1,1,1,0],[0,1,1,0,0,1,0],[1,1,0,1,0,1,1],[0,1,0,0,1,0,1],
      [1,0,1,1,0,1,0],[0,1,0,1,1,0,1],[1,0,1,0,0,1,0],[0,1,1,0,1,0,1],[1,1,0,1,0,0,1],
    ],
    admin2: [
      [0,1,0,1,0,0,1],[1,0,1,0,1,1,0],[0,1,1,0,1,0,1],[1,1,0,1,0,1,0],
      [0,0,1,0,1,0,1],[1,0,0,1,1,0,1],[0,1,1,0,0,1,0],[1,0,1,1,0,0,1],
      [0,1,0,0,1,1,0],[1,1,0,1,0,1,0],[0,0,1,0,1,0,1],[1,0,1,1,0,1,0],[0,1,0,0,1,0,1],
    ],
  });

  const [upcoming, setUpcoming] = useState<UpcomingMap>({
    trainer1: [{time:'09:00',dur:'60',name:'Пилатес (начинающие)',clients:8,hall:'A',color:'#5BAB72'},{time:'11:00',dur:'60',name:'Пилатес (продвинутые)',clients:6,hall:'B',color:'#4A80C4'},{time:'14:00',dur:'45',name:'Частная тренировка',clients:1,hall:'C',color:'#e08060'},{time:'16:30',dur:'60',name:'Пилатес (группа)',clients:9,hall:'A',color:'#5BAB72'}],
    trainer2: [{time:'10:00',dur:'60',name:'Хатха-йога',clients:10,hall:'B',color:'#4A80C4'},{time:'12:00',dur:'75',name:'Йога-нидра',clients:7,hall:'A',color:'#5BAB72'},{time:'18:00',dur:'60',name:'Вечерняя йога',clients:12,hall:'C',color:'#e08060'}],
    trainer3: [{time:'08:00',dur:'60',name:'Утренний стретчинг',clients:6,hall:'C',color:'#e08060'},{time:'13:00',dur:'60',name:'Глубокий стретчинг',clients:8,hall:'A',color:'#5BAB72'},{time:'19:00',dur:'90',name:'Гибкость и растяжка',clients:5,hall:'B',color:'#4A80C4'}],
    admin1:   [{time:'09:00',dur:'480',name:'Смена администратора',clients:null,hall:'A',color:'#4A80C4'}],
    owner:    [{time:'11:00',dur:'60',name:'Финансовый отчёт',clients:null,hall:'A',color:'#FCAE91'}],
  });

  // ── Tooltip ───────────────────────────────────────────────────────────────
  const [tooltip, setTooltip] = useState<TooltipState>({ show: false, x: 0, y: 0, title: '', sub: '' });

  // ─── Derived ──────────────────────────────────────────────────────────────
  const activeStaff = initialStaff.find(s => s.id === activeStaffId)!;
  const isOwner   = activeStaff.id === 'owner';
  const isTrainer = activeStaff.id.startsWith('trainer');
  const loadValue = parseInt(activeStaff.stats.find(x => x.l === 'Загрузка')?.v || '0');

  // ─── Helpers ──────────────────────────────────────────────────────────────
  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 2500);
  };

  // ─── Schedule handlers ────────────────────────────────────────────────────
  const toggleSlot = (ti: number, di: number) => {
    const isBooked = schedules[activeStaffId]?.[ti]?.[di];
    if (isBooked) {
      if (dontAskDelete) {
        const s = { ...schedules };
        s[activeStaffId][ti][di] = 0;
        setSchedules(s);
        showToast('Слот удалён');
        return;
      }
      setDeleteModal({
        isOpen: true,
        title: 'Удалить слот из графика?',
        message: `${times[ti]} · ${days[di]} — убрать выбранное время?`,
        showDontAsk: true,
        onConfirm: () => {
          const s = { ...schedules };
          s[activeStaffId][ti][di] = 0;
          setSchedules(s);
          showToast('Слот удалён');
          closeDeleteModal();
        },
      });
    } else {
      const s = { ...schedules };
      if (!s[activeStaffId]) s[activeStaffId] = Array(13).fill(null).map(() => Array(7).fill(0));
      s[activeStaffId][ti][di] = 1;
      setSchedules(s);
      showToast('Слот добавлен');
    }
  };

  const clearSchedule = () => {
    setDeleteModal({
      isOpen: true,
      title: 'Очистить график?',
      message: 'Все слоты на неделю будут удалены.',
      confirmText: 'Очистить',
      onConfirm: () => {
        const s = { ...schedules };
        s[activeStaffId] = Array(13).fill(null).map(() => Array(7).fill(0));
        setSchedules(s);
        showToast('График очищен');
        closeDeleteModal();
      },
    });
  };

  const fillSchedule = () => {
    const s = { ...schedules };
    s[activeStaffId] = Array(13).fill(null).map(() => Array(7).fill(null).map(() => (Math.random() > 0.45 ? 1 : 0)));
    setSchedules(s);
    showToast('График заполнен автоматически');
  };

  const handleMouseEnterSlot = (e: MouseEvent, ti: number, di: number) => {
    const isBooked = schedules[activeStaffId]?.[ti]?.[di];
    setTooltip({
      show: true, x: e.clientX + 12, y: e.clientY - 40,
      title: `${times[ti]} · ${days[di]}`,
      sub: isBooked ? 'Нажмите чтобы убрать' : 'Нажмите чтобы добавить слот',
    });
  };

  const deleteEvent = (i: number) => {
    const u = upcoming[activeStaffId][i];
    if (dontAskDelete) {
      const next = { ...upcoming };
      next[activeStaffId].splice(i, 1);
      setUpcoming(next);
      showToast('Занятие удалено');
      return;
    }
    setDeleteModal({
      isOpen: true,
      title: 'Удалить занятие?',
      message: `${u.name} · ${u.time}`,
      showDontAsk: true,
      onConfirm: () => {
        const next = { ...upcoming };
        next[activeStaffId].splice(i, 1);
        setUpcoming(next);
        showToast('Занятие удалено');
        closeDeleteModal();
      },
    });
  };

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div style={{ height: 'calc(100vh - 56px - 56px)', display: 'flex', flexDirection: 'column', gap: '16px' }}>

      {/* ── SUMMARY STATS ─────────────────────────────────────────────────── */}
      <StaffStats staff={initialStaff} />

      {/* ── MAIN LAYOUT ───────────────────────────────────────────────────── */}
      <div className="staff-layout" style={{ flex: 1, minHeight: 0 }}>

        {/* LEFT PANEL */}
        <StaffList
          staffList={staffList}
          activeStaffId={activeStaffId}
          onSelect={setActiveStaffId}
          searchQuery={searchQuery}
          onSearch={setSearchQuery}
          activeGroup={activeGroup}
          onGroupChange={setActiveGroup}
          availableGroups={availableGroups}
          onAddClick={() => setIsAddModalOpen(true)}
        />

        {/* RIGHT PANEL: PROFILE */}
        <div className="premium-right">
          <div className="premium-hero" style={{ height: '160px' }}>
            <div className="hero-bg" style={{ background: activeStaff.bg }} />

            <div className="hero-actions">
              <button
                className="h-btn"
                onClick={() => setActionModal({
                  isOpen: true, title: `Написать ${activeStaff.name.split(' ')[0]}`,
                  sub: 'Сообщение уйдет в рабочий чат', type: 'PROMPT_MESSAGE',
                  onConfirm: () => { showToast('Сообщение отправлено'); closeActionModal(); },
                })}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                Написать
              </button>
              <button
                className="h-btn"
                onClick={() => setActionModal({
                  isOpen: true, title: `Связаться: ${activeStaff.name.split(' ')[0]}`,
                  sub: 'Выберите удобный способ связи', type: 'PROMPT_CALL',
                  phone: activeStaff.phone,
                })}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.99 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.92 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 8.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                Звонок
              </button>

              {!isOwner && (
                <button
                  onClick={() => setIsEditModalOpen(true)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '8px',
                    padding: '10px 20px', background: '#FFFFFF', color: '#1A1A1A',
                    border: '1px solid rgba(26,26,26,0.1)', borderRadius: '12px',
                    fontSize: '13px', fontWeight: 700, cursor: 'pointer',
                    transition: 'all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1)',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
                    fontFamily: "'Manrope', sans-serif",
                  }}
                  onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.08)'; e.currentTarget.style.borderColor = 'rgba(26,26,26,0.2)'; }}
                  onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.05)'; e.currentTarget.style.borderColor = 'rgba(26,26,26,0.1)'; }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                  </svg>
                  Редактировать
                </button>
              )}
            </div>

            <div className="hero-info">
              <div className="hero-ava" style={{ background: activeStaff.grad }}>
                {activeStaff.initials}
                {activeStaff.online && <div className="badge-online" />}
              </div>
              <div>
                <div className="hero-name">{activeStaff.name}</div>
                <div className="hero-role">
                  {activeStaff.role}{' '}
                  {activeStaff.online
                    ? <span style={{ color: '#5BAB72', fontWeight: 700 }}>· онлайн</span>
                    : '· офлайн'}
                </div>
              </div>
            </div>
          </div>

          <div className="premium-body fade-in" key={activeStaff.id}>

            {/* Stats cards */}
            <div className="stats-row" style={{ gridTemplateColumns: `repeat(${activeStaff.stats.length}, 1fr)` }}>
              {activeStaff.stats.map((st, idx) => (
                <div key={idx} className="stat-card">
                  <div className="stat-v">{st.v}</div>
                  <div className="stat-l">{st.l}</div>
                </div>
              ))}
            </div>

            {/* Info chips */}
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

            {/* Owner card */}
            {isOwner && (
              <div className="owner-card">
                <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                  Полный доступ
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text2)', marginBottom: '2px' }}>Владелец имеет доступ ко всем модулям системы</div>
                <div className="owner-perm">
                  {['Финансы', 'Сотрудники', 'Отчёты', 'Клиенты', 'Настройки'].map(p => (
                    <span key={p} className="perm-badge">{p}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Load bar */}
            {isTrainer && loadValue > 0 && (
              <div className="load-bar-wrap" style={{ marginTop: '4px' }}>
                <div className="load-bar-top">
                  <span className="load-bar-label">Загрузка тренера</span>
                  <span className="load-bar-pct">{loadValue}%</span>
                </div>
                <div className="load-bar-bg">
                  <div
                    className="load-bar-fill"
                    style={{ width: `${loadValue}%`, background: loadValue > 85 ? '#5BAB72' : loadValue > 60 ? '#FCAE91' : '#D88C9A' }}
                  />
                </div>
              </div>
            )}

            {/* Schedule grid */}
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
                      <button className={`day-tab ${scheduleView === 'week' ? 'active' : ''}`} onClick={() => setScheduleView('week')}>Неделя</button>
                      <button className={`day-tab ${scheduleView === 'month' ? 'active' : ''}`} onClick={() => setScheduleView('month')}>Месяц</button>
                    </div>
                    <span className="week-label">{scheduleView === 'week' ? '2–8 июня 2026' : 'Июнь 2026'}</span>
                  </div>

                  {scheduleView === 'week' ? (
                    <>
                      <div className="sch-grid">
                        <div className="sch-head" />
                        {days.map((d, i) => <div key={i} className="sch-head">{d}</div>)}

                        {times.map((t, ti) => (
                          <React.Fragment key={ti}>
                            <div className="sch-time">{t}</div>
                            {[0,1,2,3,4,5,6].map(di => {
                              const booked = schedules[activeStaffId]?.[ti]?.[di];
                              return (
                                <div
                                  key={di}
                                  className={`sch-cell ${booked ? 'booked' : ''}`}
                                  onMouseEnter={e => handleMouseEnterSlot(e, ti, di)}
                                  onMouseLeave={() => setTooltip(t => ({ ...t, show: false }))}
                                  onClick={() => toggleSlot(ti, di)}
                                />
                              );
                            })}
                          </React.Fragment>
                        ))}
                      </div>

                      <div className="sch-legend">
                        {Object.values(halls).map((h, i) => (
                          <div key={i} className="leg">
                            <div className="leg-dot" style={{ background: h.color }} />
                            {h.name}
                          </div>
                        ))}
                        <div className="leg">
                          <div className="leg-dot" style={{ background: 'rgba(252,174,145,.12)', border: '1px solid var(--border2)' }} />
                          Свободно
                        </div>
                      </div>
                    </>
                  ) : (
                    <div style={{ padding: '8px 10px 10px' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px', marginBottom: '4px' }}>
                        {days.map(d => (
                          <div key={d} style={{ fontSize: '9px', fontWeight: 700, color: 'var(--text3)', textAlign: 'center', padding: '3px 0' }}>{d}</div>
                        ))}
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px' }}>
                        {(() => {
                          const cells: React.ReactNode[] = [];
                          const firstDow = (new Date(2026, 5, 1).getDay() + 6) % 7;
                          for (let i = 0; i < firstDow; i++) {
                            cells.push(<div key={`e${i}`} style={{ height: '28px', borderRadius: '5px', background: 'rgba(26,26,26,0.02)' }} />);
                          }
                          for (let day = 1; day <= 30; day++) {
                            const dow = (new Date(2026, 5, day).getDay() + 6) % 7;
                            const load = (schedules[activeStaffId] ?? []).reduce((sum, row) => sum + (row[dow] ?? 0), 0);
                            const opacity = 0.06 + (load / 13) * 0.64;
                            cells.push(
                              <div key={day} style={{
                                height: '28px', borderRadius: '5px', position: 'relative',
                                background: `rgba(252,174,145,${opacity.toFixed(2)})`,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                cursor: 'default',
                              }}>
                                <span style={{ fontSize: '9px', fontWeight: 600, color: load > 6 ? '#a05040' : 'var(--text3)' }}>{day}</span>
                              </div>
                            );
                          }
                          return cells;
                        })()}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <div style={{ width: '24px', height: '8px', borderRadius: '3px', background: 'rgba(252,174,145,0.06)' }} />
                          <span style={{ fontSize: '9px', color: 'var(--text3)' }}>Свободно</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <div style={{ width: '24px', height: '8px', borderRadius: '3px', background: 'rgba(252,174,145,0.70)' }} />
                          <span style={{ fontSize: '9px', color: 'var(--text3)' }}>Занято</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}

            {/* Upcoming events */}
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
                      <div className="up-dot" style={{ background: u.color }} />
                      <div className="up-info">
                        <div className="up-name">{u.name}</div>
                        <div className="up-sub">{u.clients ? `${u.clients} клиентов · ` : ''}{halls[u.hall]?.name || ''}</div>
                      </div>
                      <div className="up-hall" style={{ background: `${u.color}18`, color: u.color }}>Зал {u.hall}</div>
                      <div className="up-actions">
                        <button className="up-icon-btn del" onClick={() => deleteEvent(i)}>
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

      {/* ── TOOLTIP ──────────────────────────────────────────────────────────── */}
      {tooltip.show && (
        <div className="slot-tip show" style={{ left: tooltip.x, top: tooltip.y }}>
          <span style={{ fontWeight: 700 }}>{tooltip.title}</span>
          <span className="slot-sub">{tooltip.sub}</span>
        </div>
      )}

      {/* ── ACTION MODAL (write / call) ───────────────────────────────────── */}
      {actionModal.isOpen && (
        <div
          onClick={closeActionModal}
          style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            background: 'rgba(26,26,26,0.3)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            animation: 'fadeIn 0.2s ease forwards', padding: '20px', boxSizing: 'border-box',
          }}
        >
          <style>{`@keyframes fadeIn{from{opacity:0}to{opacity:1}} @keyframes scaleUp{from{opacity:0;transform:scale(.95) translateY(10px)}to{opacity:1;transform:scale(1) translateY(0)}}`}</style>
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: '#FFFFFF', width: '100%', maxWidth: '420px',
              borderRadius: '24px', padding: '32px',
              boxShadow: '0 24px 48px -12px rgba(26,26,26,0.15), 0 0 0 1px rgba(26,26,26,0.04)',
              animation: 'scaleUp 0.3s cubic-bezier(0.34,1.56,0.64,1) forwards',
              display: 'flex', flexDirection: 'column', gap: '24px',
              fontFamily: "'Manrope', sans-serif",
            }}
          >
            <div>
              <div style={{ width:'48px',height:'48px',borderRadius:'14px',marginBottom:'20px',background:'rgba(74,128,196,0.15)',color:'#4A80C4',display:'flex',alignItems:'center',justifyContent:'center' }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
              </div>
              <div style={{ fontSize:'20px',fontWeight:800,color:'#1A1A1A',letterSpacing:'-0.3px',marginBottom:'8px' }}>{actionModal.title}</div>
              <div style={{ fontSize:'14px',color:'#666',lineHeight:1.5 }}>{actionModal.sub}</div>
            </div>

            {actionModal.type === 'PROMPT_MESSAGE' && (
              <textarea
                placeholder="Введите сообщение..."
                autoFocus
                style={{ width:'100%',height:'100px',padding:'16px',background:'#FDFCFB',border:'1.5px solid rgba(26,26,26,0.1)',borderRadius:'12px',fontSize:'14px',color:'#1A1A1A',outline:'none',resize:'none',fontFamily:'inherit',boxSizing:'border-box' }}
              />
            )}

            {actionModal.type === 'PROMPT_CALL' && (
              <div style={{ display:'flex',flexDirection:'column',gap:'8px' }}>
                <div onClick={() => { closeActionModal(); showToast('Начинаем звонок...'); }} style={{ display:'flex',alignItems:'center',gap:'16px',padding:'16px',background:'#FDFCFB',border:'1.5px solid rgba(26,26,26,0.06)',borderRadius:'16px',cursor:'pointer',transition:'all 0.2s' }} onMouseEnter={e => { e.currentTarget.style.borderColor='rgba(74,128,196,0.3)'; e.currentTarget.style.background='#FFF'; }} onMouseLeave={e => { e.currentTarget.style.borderColor='rgba(26,26,26,0.06)'; e.currentTarget.style.background='#FDFCFB'; }}>
                  <div style={{ width:'40px',height:'40px',borderRadius:'10px',background:'rgba(74,128,196,0.1)',color:'#4A80C4',display:'flex',alignItems:'center',justifyContent:'center' }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.99 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.92 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 8.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                  </div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:'15px',fontWeight:800,color:'#1A1A1A' }}>Обычный звонок</div>
                    <div style={{ fontSize:'13px',color:'#666' }}>{actionModal.phone}</div>
                  </div>
                </div>
                <div onClick={() => { closeActionModal(); showToast('Открываем WhatsApp...'); }} style={{ display:'flex',alignItems:'center',gap:'16px',padding:'16px',background:'#FDFCFB',border:'1.5px solid rgba(26,26,26,0.06)',borderRadius:'16px',cursor:'pointer',transition:'all 0.2s' }} onMouseEnter={e => { e.currentTarget.style.borderColor='rgba(91,171,114,0.3)'; e.currentTarget.style.background='#FFF'; }} onMouseLeave={e => { e.currentTarget.style.borderColor='rgba(26,26,26,0.06)'; e.currentTarget.style.background='#FDFCFB'; }}>
                  <div style={{ width:'40px',height:'40px',borderRadius:'10px',background:'rgba(91,171,114,0.12)',color:'#5BAB72',display:'flex',alignItems:'center',justifyContent:'center' }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
                  </div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:'15px',fontWeight:800,color:'#1A1A1A' }}>Написать в WhatsApp</div>
                    <div style={{ fontSize:'13px',color:'#666' }}>Перейти в мессенджер</div>
                  </div>
                </div>
              </div>
            )}

            <div style={{ display:'flex',gap:'12px' }}>
              <button onClick={closeActionModal} style={{ flex:1,padding:'12px',background:'#FDFCFB',color:'#1A1A1A',border:'1.5px solid rgba(26,26,26,0.1)',borderRadius:'12px',fontSize:'14px',fontWeight:700,cursor:'pointer',transition:'all 0.2s',fontFamily:'inherit' }} onMouseEnter={e=>e.currentTarget.style.background='rgba(26,26,26,0.02)'} onMouseLeave={e=>e.currentTarget.style.background='#FDFCFB'}>
                Отмена
              </button>
              {actionModal.onConfirm && (
                <button onClick={actionModal.onConfirm} style={{ flex:1,padding:'12px',background:'#1A1A1A',color:'#FFFFFF',border:'none',borderRadius:'12px',fontSize:'14px',fontWeight:700,cursor:'pointer',transition:'all 0.2s',fontFamily:'inherit',boxShadow:'0 8px 24px rgba(26,26,26,0.15)' }} onMouseEnter={e=>{e.currentTarget.style.transform='translateY(-2px)';e.currentTarget.style.filter='brightness(1.05)'}} onMouseLeave={e=>{e.currentTarget.style.transform='none';e.currentTarget.style.filter='none'}}>
                  Отправить
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── DELETE CONFIRM ────────────────────────────────────────────────── */}
      <DeleteConfirmModal
        isOpen={deleteModal.isOpen}
        title={deleteModal.title}
        message={deleteModal.message}
        confirmText={deleteModal.confirmText}
        dontAsk={deleteModal.showDontAsk ? dontAskDelete : undefined}
        onDontAskChange={deleteModal.showDontAsk ? setDontAskDelete : undefined}
        onConfirm={deleteModal.onConfirm}
        onClose={closeDeleteModal}
      />

      {/* ── ADD EMPLOYEE MODAL ───────────────────────────────────────────── */}
      <AddEmployeeModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onSuccess={data => {
          showToast(`Сотрудник ${data.name?.split(' ')[0] ?? ''} добавлен`);
        }}
      />

      {/* ── EDIT EMPLOYEE MODAL ──────────────────────────────────────────── */}
      <EditStaffModal
        isOpen={isEditModalOpen}
        staff={isEditModalOpen ? {
          id: activeStaff.id,
          name: activeStaff.name,
          phone: activeStaff.phone ?? '',
          email: activeStaff.email ?? '',
          role: activeStaff.role,
          initials: activeStaff.initials,
          grad: activeStaff.grad,
          online: activeStaff.online,
        } : null}
        onClose={() => setIsEditModalOpen(false)}
        onSave={() => { showToast('Изменения сохранены'); }}
      />

      {/* ── TOAST ────────────────────────────────────────────────────────── */}
      <div 
        className={`toast ${toastMsg ? 'show' : ''}`}
        style={{ 
          opacity: toastMsg ? 1 : 0,
          visibility: toastMsg ? 'visible' : 'hidden',
          pointerEvents: 'none'
        }}
      >
        {toastMsg}
      </div>

    </div>
  );
}
