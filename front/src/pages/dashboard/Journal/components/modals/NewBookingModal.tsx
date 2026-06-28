// src/components/modals/NewBookingModal.tsx
import React, { useState, useEffect, useRef, useMemo } from 'react';
import * as Icons from '../../../../../components/Icons';
import type { Booking } from '../../types';
import { TRAINERS, HALLS, TIMES } from '../../constants';
import { formatIndexToTimeStr, parseTimeToIndex, generateTimeIntervals } from '../../utils';

interface NewBookingModalProps {
  newBookingSlot: { trainer: number; timeStart: number; timeEnd: number };
  setNewBookingSlot: React.Dispatch<React.SetStateAction<{ trainer: number; timeStart: number; timeEnd: number } | null>>;
  newFormPos: { x: number; y: number };
  modalRef: React.RefObject<HTMLDivElement | null>;
  timeStep: number;
  closeNewForm: () => void;
  setBookings: React.Dispatch<React.SetStateAction<Booking[]>>;
  showToast: (msg: string) => void;
}

export const NewBookingModal: React.FC<NewBookingModalProps> = ({
  newBookingSlot,
  setNewBookingSlot,
  newFormPos,
  modalRef,
  timeStep,
  closeNewForm,
  setBookings,
  showToast
}) => {
  // 🔥 ЛОКАЛЬНЫЕ СТЕЙТЫ ФОРМЫ СОЗДАНИЯ
  const [newForm, setNewForm] = useState({ title: '', hall: 'Зал 1', maxClients: '8' });
  const [startInput, setStartInput] = useState('');
  const [endInput, setEndInput] = useState('');
  const [activeDropdown, setActiveDropdown] = useState<'start' | 'end' | null>(null);

  const startScrollRef = useRef<HTMLDivElement>(null);
  const endScrollRef = useRef<HTMLDivElement>(null);

  const KP_INTERVALS = useMemo(() => generateTimeIntervals(timeStep), [timeStep]);

  // Синхронизация инпутов с текущим слотом
  useEffect(() => {
    if (newBookingSlot) {
      setStartInput(formatIndexToTimeStr(newBookingSlot.timeStart));
      setEndInput(formatIndexToTimeStr(newBookingSlot.timeEnd));
    }
  }, [newBookingSlot.timeStart, newBookingSlot.timeEnd]);

  // Автоматический проскролл дропдаунов
  useEffect(() => {
    if (activeDropdown === 'start' && startScrollRef.current) {
      setTimeout(() => startScrollRef.current?.querySelector('.active-time-item')?.scrollIntoView({ block: 'center' }), 0);
    }
    if (activeDropdown === 'end' && endScrollRef.current) {
      setTimeout(() => endScrollRef.current?.querySelector('.active-time-item')?.scrollIntoView({ block: 'center' }), 0);
    }
  }, [activeDropdown]);

  // Закрытие дропдаунов при клике вне
  useEffect(() => {
    const closeAllDps = (e: MouseEvent) => {
      if ((e.target as HTMLElement)?.closest('.kp-time-container')) return;
      setActiveDropdown(null);
    };
    document.addEventListener('click', closeAllDps);
    return () => document.removeEventListener('click', closeAllDps);
  }, []);

  // ФИКСАЦИЯ ВРЕМЕНИ
  const commitTime = (type: 'start' | 'end', val: string) => {
    let idx = parseTimeToIndex(val);
    
    if (type === 'start') {
      setNewBookingSlot(prev => prev ? { ...prev, timeStart: idx, timeEnd: Math.max(prev.timeEnd, idx + 0.25) } : null);
    } else {
      setNewBookingSlot(prev => {
        if (!prev) return null;
        let newIdx = idx;
        if (newIdx <= prev.timeStart) newIdx = prev.timeStart + 0.25;
        return { ...prev, timeEnd: newIdx };
      });
    }
    setActiveDropdown(null);
  };

  // ФУНКЦИЯ СОЗДАНИЯ (Теперь живет внутри модалки)
  const createBooking = () => {
    if (!newForm.title.trim()) return;
    const finalTitle = newForm.title.trim() || 'Новое занятие';
    const trainerObj = TRAINERS.find(t => t.id === newBookingSlot.trainer) || TRAINERS[0];
    const nb: Booking = {
      id: Date.now(),
      trainer: newBookingSlot.trainer,
      timeStart: newBookingSlot.timeStart,
      timeEnd: newBookingSlot.timeEnd,
      title: finalTitle, // <-- используем новую переменную
      hall: newForm.hall,
      clients: 0,
      maxClients: parseInt(newForm.maxClients) || 8,
      color: trainerObj.color,
      status: 'confirmed',
    };
    setBookings(prev => [...prev, nb]);
    closeNewForm();
    showToast('Занятие добавлено');
  };

  return (
    <>
      <div
        style={{ position: 'fixed', inset: 0, zIndex: 9998 }}
        onMouseDown={closeNewForm}
      />
      <div
        style={{ position: 'fixed', left: newFormPos.x, top: newFormPos.y, zIndex: 9999 }}
        onMouseDown={e => e.stopPropagation()}
      >
        <div className="keypad-modal" ref={modalRef}>
          
          <div style={{ padding: '24px 24px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border2)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ width: '38px', height: '38px', borderRadius: '10px', background: 'rgba(249,160,139,0.1)', color: 'var(--peach)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icons.Plus />
              </div>
              <div>
                <div style={{ fontSize: 16, fontWeight: 900, color: 'var(--onyx)', letterSpacing: '-0.3px' }}>Новое занятие</div>
                <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, marginTop: 1 }}>
                  Время слота: <span style={{ color: 'var(--peach)', fontWeight: 800 }}>
                    {[...TIMES, '22:00', '23:00'][newBookingSlot.timeStart] || '00:00'} – {[...TIMES, '22:00', '23:00'][newBookingSlot.timeEnd] || '00:00'}
                  </span>
                </div>
              </div>
            </div>
            <button type="button" className="btn-icon" onClick={closeNewForm}><Icons.X /></button>
          </div>

          <div className="kp-grid">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              
              <div className="kp-section">
                <div className="kp-section-title">Название программы</div>
                <input
                  className="modal-input"
                  style={{ margin: 0, background: 'var(--bg)', border: '1px solid var(--border)', height: '40px', borderRadius: '10px', fontSize: '13px', fontWeight: 600 }}
                  placeholder="Например: Пилатес Реформер"
                  value={newForm.title}
                  onChange={e => setNewForm(f => ({ ...f, title: e.target.value }))}
                  autoFocus
                />
              </div>

              <div className="kp-section">
                <div className="kp-section-title">Локация / Зал</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  {HALLS.map(h => (
                    <div
                      key={h}
                      className={`kp-chip ${newForm.hall === h ? 'active' : ''}`}
                      style={newForm.hall === h ? { background: 'var(--onyx)', borderColor: 'var(--onyx)', boxShadow: '0 4px 12px rgba(26,26,26,0.12)' } : {}}
                      onClick={() => setNewForm(f => ({ ...f, hall: h }))}
                    >
                      {h}
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="kp-section" onClick={e => e.stopPropagation()}>
                  <div className="kp-section-title">Начало</div>
                  <div className="kp-time-container">
                    <input
                      type="text"
                      className="modal-input kp-time-input"
                      style={{ margin: 0, background: 'var(--bg)', border: '1px solid var(--border)', height: '40px', borderRadius: '10px', fontSize: '13px', fontWeight: 700, textAlign: 'center', color: 'var(--onyx)' }}
                      value={startInput}
                      onFocus={(e) => { e.target.select(); setActiveDropdown('start'); }}
                      onChange={e => setStartInput(e.target.value)}
                      onBlur={(e) => commitTime('start', e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') commitTime('start', startInput); }}
                    />
                    {activeDropdown === 'start' && (
                      <div className="kp-time-dropdown" ref={startScrollRef}>
                        {KP_INTERVALS.map(t => (
                          <div
                            key={t}
                            className={`kp-time-item ${formatIndexToTimeStr(newBookingSlot.timeStart) === t ? 'active-time-item' : ''}`}
                            onMouseDown={(e) => { e.preventDefault(); commitTime('start', t); }}
                          >
                            {t}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="kp-section" onClick={e => e.stopPropagation()}>
                  <div className="kp-section-title">Конец</div>
                  <div className="kp-time-container">
                    <input
                      type="text"
                      className="modal-input kp-time-input"
                      style={{ margin: 0, background: 'var(--bg)', border: '1px solid var(--border)', height: '40px', borderRadius: '10px', fontSize: '13px', fontWeight: 700, textAlign: 'center', color: 'var(--onyx)' }}
                      value={endInput}
                      onFocus={(e) => { e.target.select(); setActiveDropdown('end'); }}
                      onChange={e => setEndInput(e.target.value)}
                      onBlur={(e) => commitTime('end', e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') commitTime('end', endInput); }}
                    />
                    {activeDropdown === 'end' && (
                      <div className="kp-time-dropdown" ref={endScrollRef}>
                        {KP_INTERVALS.map(t => {
                          const idx = parseTimeToIndex(t);
                          if (idx <= newBookingSlot.timeStart) return null;
                          return (
                            <div
                              key={t}
                              className={`kp-time-item ${formatIndexToTimeStr(newBookingSlot.timeEnd) === t ? 'active-time-item' : ''}`}
                              onMouseDown={(e) => { e.preventDefault(); commitTime('end', t); }}
                            >
                              {t}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="kp-section">
                <div className="kp-section-title">Лимит группы</div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--bg)', padding: '0 6px 0 14px', borderRadius: '10px', border: '1px solid var(--border)', height: '40px', boxSizing: 'border-box' }}>
                  <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--muted)' }}>Максимум мест</span>
                  <input
                    className="modal-input"
                    type="number" min="1" max="50"
                    style={{ width: 56, height: 28, margin: 0, textAlign: 'center', padding: 0, background: 'white', border: '1px solid var(--border)', borderRadius: '6px', fontWeight: 700 }}
                    value={newForm.maxClients}
                    onChange={e => setNewForm(f => ({ ...f, maxClients: e.target.value }))}
                  />
                </div>
              </div>
            </div>

            <div className="kp-section">
              <div className="kp-section-title">Назначить тренера</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {TRAINERS.map(t => {
                  const isActive = newBookingSlot.trainer === t.id;
                  return (
                    <div
                      key={t.id}
                      onClick={() => setNewBookingSlot(s => s ? { ...s, trainer: t.id } : s)}
                      style={{
                        padding: '0 12px 0 5px', borderRadius: '10px', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', gap: '10px',
                        border: `1px solid ${isActive ? t.color : 'var(--border)'}`,
                        background: isActive ? t.bg : 'var(--bg)',
                        height: '40px', boxSizing: 'border-box',
                        transition: 'all 0.2s cubic-bezier(0.34, 1.5, 0.64, 1)',
                        boxShadow: isActive ? `0 4px 12px ${t.color}20` : 'none',
                        transform: isActive ? 'translateY(-1px)' : 'none'
                      }}
                    >
                      <div style={{ width: 28, height: 28, borderRadius: '7px', background: isActive ? t.color : 'var(--border2)', color: isActive ? 'white' : 'var(--muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, transition: 'all 0.2s' }}>{t.initials}</div>
                      <span style={{ fontSize: 13, fontWeight: isActive ? 800 : 600, color: isActive ? t.color : 'var(--onyx)', flex: 1 }}>{t.name}</span>
                      {isActive && <span style={{ color: t.color, display: 'flex' }}><Icons.Check /></span>}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div style={{ padding: '16px 24px', background: '#FDFCFB', borderTop: '1px solid var(--border2)', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
            <button 
              type="button" 
              className="btn-ghost-sm" 
              style={{ height: 38, padding: '0 16px', fontSize: 12.5, borderRadius: '8px' }} 
              onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); closeNewForm(); }}
            >
              Отмена
            </button>
            <button
              type="button"
              className="btn-primary-sm"
              style={{ height: 38, padding: '0 24px', fontSize: 12.5, borderRadius: '8px' }}
              onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); createBooking(); }}
            >
              Создать занятие
            </button>
          </div>
        </div>
      </div>
    </>
  );
};