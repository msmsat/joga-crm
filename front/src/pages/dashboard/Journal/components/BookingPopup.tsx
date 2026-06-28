// src/components/modals/BookingPopup.tsx
import React, { useState, useEffect, useRef, useMemo } from 'react';
import * as Icons from '../../../../components/Icons';
import type { Booking } from '../types';
import { TRAINERS, HALLS } from '../constants';
import { formatIndexToTimeStr, parseTimeToIndex, generateTimeIntervals } from '../utils';

interface BookingPopupProps {
  popupBooking: Booking;
  popupRef: React.RefObject<HTMLDivElement | null>;
  popupPos: { x: number; y: number };
  isDraftMode: boolean;
  timeStep: number;
  setPopupBooking: (b: Booking | null) => void;
  setBookings: React.Dispatch<React.SetStateAction<Booking[]>>;
  deleteBooking: (id: number) => void;
  openAddClient: (b: Booking) => void;
  showToast: (msg: string) => void;
}

export const BookingPopup: React.FC<BookingPopupProps> = ({
  popupBooking,
  popupRef,
  popupPos,
  isDraftMode,
  timeStep,
  setPopupBooking,
  setBookings,
  deleteBooking,
  openAddClient,
  showToast
}) => {
  // 🔥 ВСЕ СТЕЙТЫ РЕДАКТИРОВАНИЯ ТЕПЕРЬ ЖИВУТ ТОЛЬКО ЗДЕСЬ
  const [isEditingBooking, setIsEditingBooking] = useState(false);
  const [editForm, setEditForm] = useState({ title: '', hall: 'Зал 1', maxClients: '8', timeStart: 0, timeEnd: 0 });
  const [editStartInput, setEditStartInput] = useState('');
  const [editEndInput, setEditEndInput] = useState('');
  const [editActiveDropdown, setEditActiveDropdown] = useState<'start' | 'end' | null>(null);

  const startScrollRef = useRef<HTMLDivElement>(null);
  const endScrollRef = useRef<HTMLDivElement>(null);

  const KP_INTERVALS = useMemo(() => generateTimeIntervals(timeStep), [timeStep]);

  // Синхронизируем инпуты при открытии модалки редактирования
  useEffect(() => {
    if (isEditingBooking) {
      setEditStartInput(formatIndexToTimeStr(editForm.timeStart));
      setEditEndInput(formatIndexToTimeStr(editForm.timeEnd));
    }
  }, [isEditingBooking, editForm.timeStart, editForm.timeEnd]);

  // Автоскролл для списков времени внутри модалки
  useEffect(() => {
    if (editActiveDropdown === 'start' && startScrollRef.current) {
      setTimeout(() => startScrollRef.current?.querySelector('.active-time-item')?.scrollIntoView({ block: 'center' }), 0);
    }
    if (editActiveDropdown === 'end' && endScrollRef.current) {
      setTimeout(() => endScrollRef.current?.querySelector('.active-time-item')?.scrollIntoView({ block: 'center' }), 0);
    }
  }, [editActiveDropdown]);

  // Закрытие дропдаунов при клике вне
  useEffect(() => {
    const closeAllDps = (e: MouseEvent) => {
      if ((e.target as HTMLElement)?.closest('.kp-time-container')) return;
      setEditActiveDropdown(null);
    };
    document.addEventListener('click', closeAllDps);
    return () => document.removeEventListener('click', closeAllDps);
  }, []);

  return (
    <div
      ref={popupRef}
      className="booking-popup"
      style={{ left: popupPos.x, top: popupPos.y }}
    >
      {/* 💎 Магическое свечение от цвета тренера */}
      <div style={{
        position: 'absolute', top: -30, left: -30, right: -30, height: 160,
        background: `radial-gradient(ellipse at top, ${popupBooking.color}35 0%, transparent 65%)`,
        pointerEvents: 'none', zIndex: 0, opacity: 0.8
      }} />

      {/* ШАПКА */}
      <div className="bp-header" style={{ position: 'relative', zIndex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 900, color: 'var(--onyx)', letterSpacing: '-0.4px', lineHeight: 1.2 }}>
              {isEditingBooking ? (editForm.title || 'Без названия') : popupBooking.title}
            </div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--muted)', marginTop: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Icons.Clock />
              {formatIndexToTimeStr(isEditingBooking ? editForm.timeStart : popupBooking.timeStart)} – {formatIndexToTimeStr(isEditingBooking ? editForm.timeEnd : popupBooking.timeEnd)}
            </div>
          </div>
          
          <div style={{
            padding: '6px 12px', borderRadius: '12px', fontSize: 11, fontWeight: 800,
            background: popupBooking.status === 'confirmed' ? 'rgba(163,201,168,0.15)' : 'rgba(216,140,154,0.15)',
            color: popupBooking.status === 'confirmed' ? '#86b08c' : '#D88C9A',
            display: 'flex', alignItems: 'center', gap: 4, letterSpacing: '0.3px', textTransform: 'uppercase'
          }}>
            {popupBooking.status === 'confirmed' && <span style={{ transform: 'scale(0.85)' }}><Icons.Check /></span>}
            {popupBooking.status === 'confirmed' ? 'Подтверждено' : 'Ожидает'}
          </div>
        </div>
      </div>

      {/* ТЕЛО С ИНФОРМАЦИЕЙ ИЛИ ФОРМА РЕДАКТИРОВАНИЯ */}
      <div className="bp-body" style={{ position: 'relative', zIndex: 10, minHeight: '180px' }}>
        
        {isEditingBooking ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', animation: 'fade-in 0.2s ease' }}>
            
            {/* 1. Название */}
            <input
              className="modal-input"
              style={{ margin: 0, height: '42px', fontSize: '14px', borderRadius: '12px', fontWeight: 700 }}
              value={editForm.title}
              onChange={e => setEditForm(f => ({ ...f, title: e.target.value }))}
              placeholder="Название занятия"
              autoFocus
            />
            
            {/* 2. 🔥 КАСТОМНЫЕ ДРОПДАУНЫ ВРЕМЕНИ */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              
              {/* Начало */}
              <div className="kp-time-container" style={{ position: 'relative' }}>
                <div style={{ display: 'flex', alignItems: 'center', background: 'var(--bg)', border: `1.5px solid ${editActiveDropdown === 'start' ? 'var(--peach)' : 'var(--border)'}`, borderRadius: '12px', padding: '0 12px', height: '42px', transition: 'border-color 0.2s', cursor: 'text' }}>
                  <span style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: 800, textTransform: 'uppercase', marginRight: '6px' }}>С</span>
                  <input
                    type="text"
                    style={{ margin: 0, padding: 0, border: 'none', background: 'transparent', height: '100%', width: '100%', fontSize: '14px', fontWeight: 800, color: 'var(--onyx)', textAlign: 'center', outline: 'none', boxShadow: 'none' }}
                    value={editStartInput}
                    onFocus={(e) => { e.target.select(); setEditActiveDropdown('start'); }}
                    onChange={e => setEditStartInput(e.target.value)}
                    onBlur={(e) => {
                      let idx = parseTimeToIndex(e.target.value);
                      setEditForm(f => ({ ...f, timeStart: idx, timeEnd: Math.max(f.timeEnd, idx + 0.25) }));
                      setEditActiveDropdown(null);
                    }}
                    onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                  />
                </div>
                {editActiveDropdown === 'start' && (
                  <div className="kp-time-dropdown" ref={startScrollRef}>
                    {KP_INTERVALS.map(t => (
                      <div
                        key={`s-${t}`}
                        className={`kp-time-item ${formatIndexToTimeStr(editForm.timeStart) === t ? 'active-time-item' : ''}`}
                        onMouseDown={(e) => {
                          e.preventDefault(); 
                          let idx = parseTimeToIndex(t);
                          setEditForm(f => ({ ...f, timeStart: idx, timeEnd: Math.max(f.timeEnd, idx + 0.25) }));
                          setEditActiveDropdown(null);
                        }}
                      >
                        {t}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Конец */}
              <div className="kp-time-container" style={{ position: 'relative' }}>
                <div style={{ display: 'flex', alignItems: 'center', background: 'var(--bg)', border: `1.5px solid ${editActiveDropdown === 'end' ? 'var(--peach)' : 'var(--border)'}`, borderRadius: '12px', padding: '0 12px', height: '42px', transition: 'border-color 0.2s', cursor: 'text' }}>
                  <span style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: 800, textTransform: 'uppercase', marginRight: '6px' }}>До</span>
                  <input
                    type="text"
                    style={{ margin: 0, padding: 0, border: 'none', background: 'transparent', height: '100%', width: '100%', fontSize: '14px', fontWeight: 800, color: 'var(--onyx)', textAlign: 'center', outline: 'none', boxShadow: 'none' }}
                    value={editEndInput}
                    onFocus={(e) => { e.target.select(); setEditActiveDropdown('end'); }}
                    onChange={e => setEditEndInput(e.target.value)}
                    onBlur={(e) => {
                      let idx = parseTimeToIndex(e.target.value);
                      if (idx <= editForm.timeStart) idx = editForm.timeStart + 0.25;
                      setEditForm(f => ({ ...f, timeEnd: idx }));
                      setEditActiveDropdown(null);
                    }}
                    onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                  />
                </div>
                {editActiveDropdown === 'end' && (
                  <div className="kp-time-dropdown" ref={endScrollRef}>
                    {KP_INTERVALS.map(t => {
                      const idx = parseTimeToIndex(t);
                      if (idx <= editForm.timeStart) return null;
                      return (
                        <div
                          key={`e-${t}`}
                          className={`kp-time-item ${formatIndexToTimeStr(editForm.timeEnd) === t ? 'active-time-item' : ''}`}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            setEditForm(f => ({ ...f, timeEnd: idx }));
                            setEditActiveDropdown(null);
                          }}
                        >
                          {t}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* 3. ЗАЛЫ (ЧИПСЫ) И ВМЕСТИМОСТЬ */}
            <div style={{ display: 'flex', gap: '8px' }}>
              <div style={{ display: 'flex', gap: '4px', flex: 1 }}>
                {HALLS.map(h => (
                  <div
                    key={h}
                    className={`kp-chip ${editForm.hall === h ? 'active' : ''}`}
                    style={{
                      flex: 1, height: '42px', padding: 0, margin: 0,
                      fontSize: '11px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      ...(editForm.hall === h ? { background: 'var(--onyx)', borderColor: 'var(--onyx)', color: 'white', boxShadow: '0 4px 12px rgba(26,26,26,0.12)' } : {})
                    }}
                    onClick={(e) => { e.stopPropagation(); setEditForm(f => ({ ...f, hall: h })); }}
                  >
                    {h.replace('Зал ', 'Зал ')}
                  </div>
                ))}
              </div>

              <div style={{ width: '80px', display: 'flex', alignItems: 'center', background: 'var(--bg)', border: '1.5px solid var(--border)', borderRadius: '10px', padding: '0 8px', height: '42px', boxSizing: 'border-box' }}>
                <span style={{ color: 'var(--muted)', display: 'flex', transform: 'scale(0.9)' }}><Icons.Users /></span>
                <input
                  type="number" min="1"
                  style={{ width: '100%', height: '100%', border: 'none', background: 'transparent', outline: 'none', fontSize: '14px', fontWeight: 800, color: 'var(--onyx)', textAlign: 'center', padding: 0 }}
                  value={editForm.maxClients}
                  onChange={e => setEditForm(f => ({ ...f, maxClients: e.target.value }))}
                />
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className="bp-row">
              <div className="bp-icon-box"><Icons.Users /></div>
              <div style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
                <span style={{ fontSize: 16, fontWeight: 900, lineHeight: 1 }}>{popupBooking.clients} / {popupBooking.maxClients}</span>
                <span style={{ color: 'var(--muted)', marginLeft: 8, fontWeight: 600, fontSize: 13, lineHeight: 1 }}>мест занято</span>
              </div>
            </div>
            
            <div className="bp-row">
              <div className="bp-icon-box"><Icons.MapPin /></div>
              <div style={{ fontWeight: 700 }}>{popupBooking.hall}</div>
            </div>
            
            <div className="bp-row">
              <div className="bp-icon-box" style={{ background: `${popupBooking.color}15` }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: popupBooking.color }} />
              </div>
              <div style={{ fontWeight: 700 }}>{TRAINERS.find(t => t.id === popupBooking.trainer)?.full}</div>
            </div>

            {popupBooking.maxClients > 0 && (
              <div style={{ marginTop: 8, background: 'rgba(26,26,26,0.02)', padding: '14px 16px', borderRadius: '16px', border: '1px solid rgba(26,26,26,0.03)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Заполненность
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 900, color: 'var(--onyx)' }}>
                    {Math.round(popupBooking.clients / popupBooking.maxClients * 100)}%
                  </span>
                </div>
                <div style={{ height: 6, background: 'rgba(26,26,26,0.06)', borderRadius: 100, overflow: 'hidden' }}>
                  <div style={{ 
                    height: '100%', width: `${popupBooking.clients / popupBooking.maxClients * 100}%`, 
                    background: popupBooking.color, borderRadius: 100,
                    transition: 'width 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)' 
                  }} />
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* КНОПКИ ДЕЙСТВИЙ */}
      <div className="bp-actions" style={{ position: 'relative', zIndex: 1 }}>
        
        {isEditingBooking ? (
          <>
            <button className="bp-btn ghost text-btn" onClick={(e) => { e.stopPropagation(); setIsEditingBooking(false); }}>
              Отмена
            </button>
            
            <button className="bp-btn primary text-btn" onClick={(e) => { 
              e.stopPropagation(); 
              const updatedMax = parseInt(editForm.maxClients) || 8;
              
              setBookings(prev => prev.map(b => b.id === popupBooking.id ? { 
                ...b, title: editForm.title, hall: editForm.hall, maxClients: updatedMax, 
                timeStart: editForm.timeStart, timeEnd: editForm.timeEnd 
              } : b));
              
              setPopupBooking({ 
                ...popupBooking, title: editForm.title, hall: editForm.hall, maxClients: updatedMax, 
                timeStart: editForm.timeStart, timeEnd: editForm.timeEnd 
              });
              
              setIsEditingBooking(false);
              showToast('Занятие обновлено');
            }}>
              Сохранить
            </button>
          </>
        ) : (
          <>
            <button className="bp-btn primary text-btn" onClick={(e) => { e.stopPropagation(); openAddClient(popupBooking); }}>
              <Icons.UserPlus /> Добавить
            </button>
            
            {isDraftMode && (
              <>
                <button className="bp-btn ghost text-btn" title="Изменить занятие" onClick={(e) => {
                  e.stopPropagation();
                  setEditForm({ 
                    title: popupBooking.title, hall: popupBooking.hall, 
                    maxClients: String(popupBooking.maxClients),
                    timeStart: popupBooking.timeStart, timeEnd: popupBooking.timeEnd      
                  });
                  setIsEditingBooking(true);
                }}>
                  <Icons.Edit /> Изменить
                </button>
                
                <button className="bp-btn danger icon-only" title="Удалить занятие" onClick={() => deleteBooking(popupBooking.id)}>
                  <Icons.Trash />
                </button>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
};