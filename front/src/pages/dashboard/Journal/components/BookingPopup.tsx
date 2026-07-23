// src/components/modals/BookingPopup.tsx
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import * as Icons from '../../../../components/Icons';
import type { Booking, Trainer } from '../types';
import type { BookedClient, EligibleClient } from '../../../../api/schedule/schedule.types';
import { scheduleApi } from '../../../../api/schedule';
import { errorMessage } from '../../../../api/errorMessage';
import { formatIndexToTimeStr, parseTimeToIndex, generateTimeIntervals, MIN_TIME_INDEX, MAX_TIME_INDEX } from '../utils';
import { useServiceOptions, CREATE_SERVICE_OPTION } from '../hooks/useServiceOptions';
import type { useJournalMutations } from '../hooks/useJournalMutations';
import type { HistoryEntry } from '../hooks/useUndoHistory';
import { useToast, Select, ConfirmModal } from '../../../../components/ui/index';

const MIN_TIME_IDX = MIN_TIME_INDEX;
const MAX_TIME_IDX = MAX_TIME_INDEX;
const EMPTY_CLIENTS: EligibleClient[] = [];

interface EditForm { serviceId: number | null; title: string; hall: string; maxClients: string; timeStart: number; timeEnd: number }

interface BookingPopupProps {
  trainers: Trainer[];
  halls: string[];
  popupBooking: Booking;
  popupRef: React.RefObject<HTMLDivElement | null>;
  popupPos: { x: number; y: number };
  canEdit: boolean;
  timeStep: number;
  setPopupBooking: (b: Booking | null) => void;
  isEditingBooking: boolean;
  setIsEditingBooking: React.Dispatch<React.SetStateAction<boolean>>;
  editForm: EditForm;
  setEditForm: React.Dispatch<React.SetStateAction<EditForm>>;
  mutations: ReturnType<typeof useJournalMutations>;
  onSave: (prev: Booking, next: Booking) => void;
  deleteBooking: (id: number) => void;
  onAddClients: (clientIds: number[]) => void;
  showToast: (msg: string) => void;
  pushHistoryEntry: (entry: HistoryEntry) => void;
}

export const BookingPopup: React.FC<BookingPopupProps> = ({
  trainers,
  halls,
  popupBooking,
  popupRef,
  popupPos,
  canEdit,
  timeStep,
  setPopupBooking,
  isEditingBooking,
  setIsEditingBooking,
  editForm,
  setEditForm,
  mutations,
  onSave,
  deleteBooking,
  onAddClients,
  showToast,
  pushHistoryEntry
}) => {
  const toast = useToast();
  const navigate = useNavigate();
  const { t } = useTranslation('journal');

  // Стейты редактирования
  const [editStartInput, setEditStartInput] = useState('');
  const [editEndInput, setEditEndInput] = useState('');
  const [editActiveDropdown, setEditActiveDropdown] = useState<'start' | 'end' | null>(null);
  const [showCatalogConfirm, setShowCatalogConfirm] = useState(false);

  // Стейты добавления клиента
  const [isAddingClient, setIsAddingClient] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedClients, setSelectedClients] = useState<number[]>([]);
  const [eligible, setEligible] = useState<{ lessonId: number; clients: EligibleClient[] } | null>(null);

  const startScrollRef = useRef<HTMLDivElement>(null);
  const endScrollRef = useRef<HTMLDivElement>(null);

  const KP_INTERVALS = useMemo(() => generateTimeIntervals(timeStep), [timeStep]);
  const { services, options: serviceOptions } = useServiceOptions();

  const handleServiceChange = (value: string) => {
    if (value === CREATE_SERVICE_OPTION) {
      setShowCatalogConfirm(true);
      return;
    }
    const service = services.find(s => String(s.id) === value);
    if (!service) return;
    setEditForm(f => ({ ...f, serviceId: service.id, title: service.name }));
  };

  // Валидация редактирования
  const editServiceError = !editForm.serviceId ? t('bookingPopup.errors.selectService') : null;
  const editMaxClientsNum = Number(editForm.maxClients);
  const editMaxClientsError = !Number.isInteger(editMaxClientsNum) || editMaxClientsNum < 1 || editMaxClientsNum > 50
    ? t('bookingPopup.errors.range')
    : editMaxClientsNum < popupBooking.clients
      ? t('bookingPopup.errors.minBooked', { count: popupBooking.clients })
      : null;
  const editTimeError = editForm.timeEnd <= editForm.timeStart ? t('bookingPopup.errors.endAfterStart') : null;
  const hasEditErrors = !!(editServiceError || editMaxClientsError || editTimeError);

  const [booked, setBooked] = useState<{ lessonId: number; clients: BookedClient[] } | null>(null);
  const bookedClients = booked?.lessonId === popupBooking.id ? booked.clients : null;

  useEffect(() => {
    let stale = false;
    scheduleApi.getLesson(popupBooking.id)
      .then(d => { if (!stale) setBooked({ lessonId: popupBooking.id, clients: d.booked_clients }); })
      .catch(() => { if (!stale) setBooked({ lessonId: popupBooking.id, clients: [] }); });
    return () => { stale = true; };
  }, [popupBooking.id]);

  const clientsLoaded = eligible?.lessonId === popupBooking.id;
  const clientsList = clientsLoaded ? eligible!.clients : EMPTY_CLIENTS;

  // Загружаем клиентов, когда открываем режим добавления. Источник — не все
  // клиенты студии, а только те, кого можно записать на это занятие (право по
  // абонементу проверяет бэк, CL-6.1/6.4) — Zero Trust, фронт не решает сам.
  // lessonId в состоянии (образец — booked/bookedClients выше) переживает смену
  // занятия без отдельного reset-эффекта.
  useEffect(() => {
    if (isAddingClient && !clientsLoaded) {
      scheduleApi.getEligibleClients(popupBooking.id)
        .then(list => setEligible({ lessonId: popupBooking.id, clients: list }))
        .catch(err => console.error('Не удалось загрузить клиентов', err));
    }
  }, [isAddingClient, clientsLoaded, popupBooking.id]);

  const patchBooked = (fn: (list: BookedClient[]) => BookedClient[]) =>
    setBooked(b => b && { ...b, clients: fn(b.clients) });

  const markAttended = (c: BookedClient) => {
    if (c.status === 'attended') return;
    mutations.attendReservation(c.reservation_id)
      .then(() => {
        patchBooked(list => list.map(x =>
          x.reservation_id === c.reservation_id ? { ...x, status: 'attended' as const } : x
        ));
        showToast(t('toasts.attendanceMarked'));
      })
      .catch((e: unknown) => toast.error(errorMessage(e, t)));
  };

  const removeClient = (c: BookedClient) => {
    mutations.cancelReservation(c.reservation_id, popupBooking)
      .then(({ next }) => {
        patchBooked(list => list.filter(x => x.reservation_id !== c.reservation_id));
        setPopupBooking(next!);
        showToast(t('toasts.clientRemoved'));

        let liveReservationId = c.reservation_id;
        pushHistoryEntry({
          label: t('toasts.historyLabels.removeClient'),
          undo: async () => {
            const booking = next!;
            const { reservationId } = await mutations.addReservation(c.client_id, booking);
            liveReservationId = reservationId;
          },
          redo: async () => { await mutations.cancelReservation(liveReservationId, next!); },
        });
      })
      .catch((e: unknown) => toast.error(errorMessage(e, t)));
  };

  // Мемоизация поиска клиентов. Список уже отфильтрован бэком по праву записи
  // и по «не записан на это занятие» (getEligibleClients) — тут только поиск.
  const filteredClients = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return clientsList.filter(c =>
      `${c.name} ${c.last_name ?? ''}`.toLowerCase().includes(q) ||
      (c.phone ?? '').includes(searchQuery)
    );
  }, [clientsList, searchQuery]);

  useEffect(() => {
    if (isEditingBooking) {
      setEditStartInput(formatIndexToTimeStr(editForm.timeStart));
      setEditEndInput(formatIndexToTimeStr(editForm.timeEnd));
    }
  }, [isEditingBooking, editForm.timeStart, editForm.timeEnd]);

  useEffect(() => {
    if (editActiveDropdown === 'start' && startScrollRef.current) {
      setTimeout(() => startScrollRef.current?.querySelector('.active-time-item')?.scrollIntoView({ block: 'center' }), 0);
    }
    if (editActiveDropdown === 'end' && endScrollRef.current) {
      setTimeout(() => endScrollRef.current?.querySelector('.active-time-item')?.scrollIntoView({ block: 'center' }), 0);
    }
  }, [editActiveDropdown]);

  useEffect(() => {
    const closeAllDps = (e: MouseEvent) => {
      if ((e.target as HTMLElement)?.closest('.kp-time-container')) return;
      setEditActiveDropdown(null);
    };
    document.addEventListener('click', closeAllDps);
    return () => document.removeEventListener('click', closeAllDps);
  }, []);

  return createPortal(
    <>
    <div
      ref={popupRef}
      className="booking-popup"
      style={{ left: popupPos.x, top: popupPos.y }}
    >
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
              {isAddingClient ? t('bookingPopup.addClient') : isEditingBooking ? (editForm.title || t('bookingPopup.untitled')) : popupBooking.title}
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
            {popupBooking.status === 'confirmed' ? t('bookingPopup.confirmed') : t('bookingPopup.pending')}
          </div>
        </div>
      </div>

      <div className="bp-body" style={{ position: 'relative', zIndex: 10, minHeight: '180px' }}>
        
        {/* РЕЖИМ ДОБАВЛЕНИЯ КЛИЕНТА */}
        {isAddingClient ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', animation: 'fade-in 0.2s ease' }}>
            <div style={{ position: 'relative', marginBottom: 4 }}>
              <div style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }}>
                <Icons.Search />
              </div>
              <input
                className="modal-input"
                style={{ paddingLeft: 34, height: 40, borderRadius: 10, fontSize: 14, margin: 0 }}
                placeholder={t('bookingPopup.searchPlaceholder')}
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                autoFocus
              />
            </div>
            <div style={{ maxHeight: 220, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4, paddingRight: 4 }}>
              {filteredClients.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '24px 0' }}>
                  <Icons.Icon.Profile size={40} color="var(--border)" className="empty-float" />
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8 }}>
                    {clientsLoaded && clientsList.length === 0
                      ? t('bookingPopup.noEligibleClients')
                      : t('bookingPopup.noClientsFound')}
                  </div>
                </div>
              ) : (
                filteredClients.map(c => {
                  const isSelected = selectedClients.includes(c.id);
                  return (
                    <div
                      key={c.id}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
                        borderRadius: 10, cursor: 'pointer', transition: 'background 0.15s',
                        background: isSelected ? 'var(--peach-soft)' : 'var(--bg)',
                      }}
                      onClick={() => setSelectedClients(prev =>
                        isSelected ? prev.filter(x => x !== c.id) : [...prev, c.id]
                      )}
                    >
                      <div style={{
                        width: 32, height: 32, borderRadius: '50%', background: 'var(--peach-soft)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 10, fontWeight: 800, color: 'var(--peach)', flexShrink: 0
                      }}>
                        {[c.name, c.last_name].filter(Boolean).map(n => n![0]).join('')}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--onyx)' }}>{c.name} {c.last_name ?? ''}</div>
                        <div style={{ fontSize: 11, color: 'var(--muted)' }}>{c.phone ?? ''}{c.subscription_hint ? ` · ${c.subscription_hint}` : ''}</div>
                      </div>
                      {isSelected && (
                        <div style={{ color: 'var(--peach)' }}><Icons.Check /></div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

        /* РЕЖИМ РЕДАКТИРОВАНИЯ ЗАНЯТИЯ */
        ) : isEditingBooking ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', animation: 'fade-in 0.2s ease' }}>
            <Select
              value={editForm.serviceId != null ? String(editForm.serviceId) : ''}
              options={serviceOptions}
              onChange={handleServiceChange}
              placeholder={t('bookingPopup.errors.selectService')}
            />
            {editServiceError && <div style={{ fontSize: 11, color: 'var(--error)', fontWeight: 600 }}>{editServiceError}</div>}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div className="kp-time-container" style={{ position: 'relative' }}>
                <div style={{ display: 'flex', alignItems: 'center', background: 'var(--bg)', border: `1.5px solid ${editActiveDropdown === 'start' ? 'var(--peach)' : editTimeError ? 'var(--error)' : 'var(--border)'}`, borderRadius: '12px', padding: '0 12px', height: '42px', transition: 'border-color 0.2s', cursor: 'text' }}>
                  <span style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: 800, textTransform: 'uppercase', marginRight: '6px' }}>{t('bookingPopup.from')}</span>
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

              <div className="kp-time-container" style={{ position: 'relative' }}>
                <div style={{ display: 'flex', alignItems: 'center', background: 'var(--bg)', border: `1.5px solid ${editActiveDropdown === 'end' ? 'var(--peach)' : editTimeError ? 'var(--error)' : 'var(--border)'}`, borderRadius: '12px', padding: '0 12px', height: '42px', transition: 'border-color 0.2s', cursor: 'text' }}>
                  <span style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: 800, textTransform: 'uppercase', marginRight: '6px' }}>{t('bookingPopup.to')}</span>
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
            {editTimeError && <div style={{ fontSize: 11, color: 'var(--error)', fontWeight: 600 }}>{editTimeError}</div>}

            <div style={{ display: 'flex', gap: '8px' }}>
              <div style={{ display: 'flex', gap: '4px', flex: 1 }}>
                {halls.map(h => (
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

              <div style={{ width: '80px', display: 'flex', alignItems: 'center', background: 'var(--bg)', border: `1.5px solid ${editMaxClientsError ? 'var(--error)' : 'var(--border)'}`, borderRadius: '10px', padding: '0 8px', height: '42px', boxSizing: 'border-box' }}>
                <span style={{ color: 'var(--muted)', display: 'flex', transform: 'scale(0.9)' }}><Icons.Users /></span>
                <input
                  type="number" min="1"
                  style={{ width: '100%', height: '100%', border: 'none', background: 'transparent', outline: 'none', fontSize: '14px', fontWeight: 800, color: 'var(--onyx)', textAlign: 'center', padding: 0 }}
                  value={editForm.maxClients}
                  onChange={e => setEditForm(f => ({ ...f, maxClients: e.target.value }))}
                />
              </div>
            </div>
            {editMaxClientsError && <div style={{ fontSize: 11, color: 'var(--error)', fontWeight: 600, textAlign: 'right' }}>{editMaxClientsError}</div>}
          </div>
          
        /* ОБЫЧНЫЙ РЕЖИМ ПРОСМОТРА */
        ) : (
          <>
            <div className="bp-row">
              <div className="bp-icon-box"><Icons.Users /></div>
              <div style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
                <span style={{ fontSize: 16, fontWeight: 900, lineHeight: 1 }}>{popupBooking.clients} / {popupBooking.maxClients}</span>
                <span style={{ color: 'var(--muted)', marginLeft: 8, fontWeight: 600, fontSize: 13, lineHeight: 1 }}>{t('bookingPopup.spotsTaken')}</span>
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
              <div style={{ fontWeight: 700 }}>{trainers.find(t => t.id === popupBooking.trainer)?.full}</div>
            </div>

            {popupBooking.maxClients > 0 && (
              <div style={{ marginTop: 8, background: 'rgba(26,26,26,0.02)', padding: '14px 16px', borderRadius: '16px', border: '1px solid rgba(26,26,26,0.03)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    {t('bookingPopup.fillRate')}
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

            {bookedClients && bookedClients.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>
                  {t('bookingPopup.booked')}
                </div>
                <div style={{ maxHeight: 168, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {bookedClients.map(c => (
                    <div key={c.reservation_id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 8px', borderRadius: 12, background: 'rgba(26,26,26,0.02)' }}>
                      <div style={{
                        width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
                        background: c.avatar_color ?? 'var(--peach)', color: 'white',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 10, fontWeight: 800
                      }}>
                        {[c.name, c.last_name].filter(Boolean).map(n => n![0]).join('').toUpperCase()}
                      </div>
                      <div style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 700, color: 'var(--onyx)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {c.name} {c.last_name ?? ''}
                      </div>
                      <button
                        className="btn-icon"
                        title={c.status === 'attended' ? t('bookingPopup.attended') : t('bookingPopup.markAttended')}
                        style={{ color: c.status === 'attended' ? '#86b08c' : 'var(--border)', cursor: c.status === 'attended' ? 'default' : 'pointer' }}
                        onClick={(e) => { e.stopPropagation(); markAttended(c); }}
                      >
                        <Icons.Check />
                      </button>
                      {canEdit && (
                        <button
                          className="btn-icon"
                          title={t('bookingPopup.removeFromLesson')}
                          style={{ color: 'var(--muted)' }}
                          onClick={(e) => { e.stopPropagation(); removeClient(c); }}
                        >
                          <Icons.X />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* КНОПКИ ДЕЙСТВИЙ */}
      <div className="bp-actions" style={{ position: 'relative', zIndex: 1 }}>
        
        {isAddingClient ? (
          <>
            <button className="bp-btn ghost text-btn" onClick={(e) => { e.stopPropagation(); setIsAddingClient(false); }}>
              {t('bookingPopup.cancel')}
            </button>
            <button
              className="bp-btn primary text-btn"
              disabled={selectedClients.length === 0}
              style={{ opacity: selectedClients.length === 0 ? 0.5 : 1, cursor: selectedClients.length === 0 ? 'not-allowed' : 'pointer' }}
              onClick={(e) => {
                e.stopPropagation();
                onAddClients(selectedClients);
                setIsAddingClient(false);
                setSelectedClients([]);
                setSearchQuery('');
              }}
            >
              <Icons.UserPlus /> {t('bookingPopup.add')} {selectedClients.length > 0 ? `(${selectedClients.length})` : ''}
            </button>
          </>
        ) : isEditingBooking ? (
          <>
            <button className="bp-btn ghost text-btn" onClick={(e) => { e.stopPropagation(); setIsEditingBooking(false); }}>
              {t('bookingPopup.cancel')}
            </button>

            <button
              className="bp-btn primary text-btn"
              disabled={hasEditErrors}
              style={{ opacity: hasEditErrors ? 0.5 : 1, cursor: hasEditErrors ? 'not-allowed' : 'pointer' }}
              onClick={(e) => {
                e.stopPropagation();
                if (hasEditErrors) return;
                const timeStart = Math.min(Math.max(editForm.timeStart, MIN_TIME_IDX), MAX_TIME_IDX - 0.25);
                const timeEnd = Math.min(Math.max(editForm.timeEnd, timeStart + 0.25), MAX_TIME_IDX);

                const next: Booking = {
                  ...popupBooking,
                  title: editForm.title,
                  hall: editForm.hall,
                  maxClients: editMaxClientsNum,
                  timeStart,
                  timeEnd,
                  serviceId: editForm.serviceId,
                };

                setPopupBooking(next);
                onSave(popupBooking, next);

                setIsEditingBooking(false);
              }}
            >
              {t('bookingPopup.save')}
            </button>
          </>
        ) : (
          <>
            {canEdit && (
              <>
                <button className="bp-btn primary text-btn" onClick={(e) => { e.stopPropagation(); setIsAddingClient(true); }}>
                  <Icons.UserPlus /> {t('bookingPopup.add')}
                </button>

                <button className="bp-btn ghost text-btn" title={t('bookingPopup.editLesson')} onClick={(e) => {
                  e.stopPropagation();
                  setEditForm({
                    serviceId: popupBooking.serviceId,
                    title: popupBooking.title, hall: popupBooking.hall,
                    maxClients: String(popupBooking.maxClients),
                    timeStart: popupBooking.timeStart, timeEnd: popupBooking.timeEnd
                  });
                  setIsEditingBooking(true);
                }}>
                  <Icons.Edit /> {t('bookingPopup.edit')}
                </button>

                <button className="bp-btn danger icon-only" title={t('bookingPopup.deleteLesson')} onClick={() => deleteBooking(popupBooking.id)}>
                  <Icons.Trash />
                </button>
              </>
            )}
          </>
        )}
      </div>
    </div>

    {showCatalogConfirm && (
      <ConfirmModal
        title={t('bookingPopup.createServiceConfirm.title')}
        message={t('bookingPopup.createServiceConfirm.message')}
        confirmText={t('bookingPopup.createServiceConfirm.confirm')}
        onConfirm={() => navigate('/dashboard/catalog')}
        onClose={() => setShowCatalogConfirm(false)}
      />
    )}
    </>,
    document.body
  );
};