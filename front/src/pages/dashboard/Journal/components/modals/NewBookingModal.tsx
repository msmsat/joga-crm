// src/components/modals/NewBookingModal.tsx
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import * as Icons from '../../../../../components/Icons';
import type { Trainer } from '../../types';
import { TIMES } from '../../constants';
import { formatIndexToTimeStr, parseTimeToIndex, generateTimeIntervals } from '../../utils';
import { useServiceOptions, CREATE_SERVICE_OPTION } from '../../hooks/useServiceOptions';
import { Select, ConfirmModal } from '../../../../../components/ui/index';

interface NewBookingModalProps {
  trainers: Trainer[];
  halls: string[];
  newBookingSlot: { trainer: number; timeStart: number; timeEnd: number };
  setNewBookingSlot: React.Dispatch<React.SetStateAction<{ trainer: number; timeStart: number; timeEnd: number } | null>>;
  newForm: { serviceId: number | null; title: string; hall: string; maxClients: string };
  setNewForm: React.Dispatch<React.SetStateAction<{ serviceId: number | null; title: string; hall: string; maxClients: string }>>;
  newFormPos: { x: number; y: number };
  modalRef: React.RefObject<HTMLDivElement | null>;
  timeStep: number;
  closeNewForm: () => void;
  onCreate: (form: { serviceId: number; title: string; hall: string; maxClients: number }) => void;
}

export const NewBookingModal: React.FC<NewBookingModalProps> = ({
  trainers,
  halls,
  newBookingSlot,
  setNewBookingSlot,
  newForm,
  setNewForm,
  newFormPos,
  modalRef,
  timeStep,
  closeNewForm,
  onCreate
}) => {
  const { t } = useTranslation('journal');
  const [startInput, setStartInput] = useState('');
  const [endInput, setEndInput] = useState('');
  const [activeDropdown, setActiveDropdown] = useState<'start' | 'end' | null>(null);
  const [showCatalogConfirm, setShowCatalogConfirm] = useState(false);
  const navigate = useNavigate();

  const startScrollRef = useRef<HTMLDivElement>(null);
  const endScrollRef = useRef<HTMLDivElement>(null);

  const KP_INTERVALS = useMemo(() => generateTimeIntervals(timeStep), [timeStep]);
  const { services, options: serviceOptions } = useServiceOptions();

  // Валидация до отправки (зеркалит серверные правила, lessons.py): услуга
  // выбрана, лимит — целое 1-50, конец позже начала.
  const serviceError = !newForm.serviceId ? t('newBooking.errors.selectService') : null;
  const maxClientsNum = Number(newForm.maxClients);
  const maxClientsError = !Number.isInteger(maxClientsNum) || maxClientsNum < 1 || maxClientsNum > 50
    ? t('newBooking.errors.range')
    : null;
  const timeError = newBookingSlot.timeEnd <= newBookingSlot.timeStart
    ? t('newBooking.errors.endAfterStart')
    : null;
  const hasErrors = !!(serviceError || maxClientsError || timeError);

  const handleServiceChange = (value: string) => {
    if (value === CREATE_SERVICE_OPTION) {
      setShowCatalogConfirm(true);
      return;
    }
    const service = services.find(s => String(s.id) === value);
    if (!service) return;
    setNewForm(f => ({
      ...f,
      serviceId: service.id,
      title: service.name,
      maxClients: service.max_clients != null ? String(service.max_clients) : f.maxClients,
    }));
  };

  // Синхронизация инпутов с текущим слотом
  useEffect(() => {
    if (newBookingSlot) {
      setStartInput(formatIndexToTimeStr(newBookingSlot.timeStart));
      setEndInput(formatIndexToTimeStr(newBookingSlot.timeEnd));
    }
  }, [newBookingSlot.timeStart, newBookingSlot.timeEnd]);

  // Автоматический проскролл дропдаунов
  useEffect(() => {
    const scrollToActiveTime = (container: HTMLDivElement | null) => {
      const activeItem = container?.querySelector<HTMLElement>('.active-time-item');
      if (!container || !activeItem) return;

      container.scrollTop = activeItem.offsetTop - (container.clientHeight - activeItem.offsetHeight) / 2;
    };

    if (activeDropdown === 'start') scrollToActiveTime(startScrollRef.current);
    if (activeDropdown === 'end') scrollToActiveTime(endScrollRef.current);
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

  // СОЗДАНИЕ: форма уходит наверх, Journal шлёт её на сервер
  const createBooking = () => {
    if (hasErrors || !newForm.serviceId) return;
    onCreate({
      serviceId: newForm.serviceId,
      title: newForm.title,
      hall: newForm.hall,
      maxClients: maxClientsNum,
    });
    closeNewForm();
  };

  return createPortal(
    <>
      <div
        className="kp-backdrop"
        style={{ position: 'fixed', inset: 0, zIndex: 200 }}
        onMouseDown={closeNewForm}
      />
      <div
        className="kp-anchor"
        style={{ position: 'fixed', left: newFormPos.x, top: newFormPos.y, zIndex: 210 }}
        onMouseDown={e => e.stopPropagation()}
      >
        <div className="keypad-modal" ref={modalRef}>

          <div className="kp-head">
            <div className="kp-head-l">
              <div className="kp-head-icon">
                <Icons.Plus />
              </div>
              <div>
                <div className="kp-head-title">{t('newBooking.title')}</div>
                <div className="kp-head-sub">
                  {t('newBooking.slotTime')}: <span style={{ color: 'var(--peach)', fontWeight: 800 }}>
                    {[...TIMES, '22:00', '23:00'][newBookingSlot.timeStart] || '00:00'} – {[...TIMES, '22:00', '23:00'][newBookingSlot.timeEnd] || '00:00'}
                  </span>
                </div>
              </div>
            </div>
            <button type="button" className="btn-icon" onClick={closeNewForm}><Icons.X /></button>
          </div>

          <div className="kp-grid">
            <div className="kp-col">

              <div className="kp-section">
                <div className="kp-section-title">{t('newBooking.service')}</div>
                <Select
                  value={newForm.serviceId != null ? String(newForm.serviceId) : ''}
                  options={serviceOptions}
                  onChange={handleServiceChange}
                  placeholder={t('newBooking.servicePlaceholder')}
                />
                {serviceError && <div style={{ fontSize: 11, color: 'var(--error)', fontWeight: 600, marginTop: 4 }}>{serviceError}</div>}
              </div>

              <div className="kp-section">
                <div className="kp-section-title">{t('newBooking.location')}</div>
                <div className="kp-halls">
                  {halls.map(h => (
                    <div
                      key={h}
                      className={`kp-chip ${newForm.hall === h ? 'active' : ''}`}
                      style={newForm.hall === h ? { background: 'var(--onyx)', borderColor: 'var(--onyx)', color: 'var(--bg)', boxShadow: '0 4px 12px rgba(26,26,26,0.12)' } : {}}
                      onClick={() => setNewForm(f => ({ ...f, hall: h }))}
                    >
                      {h}
                    </div>
                  ))}
                </div>
              </div>

              <div className="kp-times">
                <div className="kp-section" onClick={e => e.stopPropagation()}>
                  <div className="kp-section-title">{t('newBooking.start')}</div>
                  <div className="kp-time-container">
                    <input
                      type="text"
                      className="modal-input kp-time-input"
                      style={{ margin: 0, background: 'var(--bg)', border: `1px solid ${timeError ? 'var(--error)' : 'var(--border)'}`, borderRadius: '10px', fontSize: '13px', fontWeight: 700, textAlign: 'center', color: 'var(--onyx)' }}
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
                  <div className="kp-section-title">{t('newBooking.end')}</div>
                  <div className="kp-time-container">
                    <input
                      type="text"
                      className="modal-input kp-time-input"
                      style={{ margin: 0, background: 'var(--bg)', border: `1px solid ${timeError ? 'var(--error)' : 'var(--border)'}`, borderRadius: '10px', fontSize: '13px', fontWeight: 700, textAlign: 'center', color: 'var(--onyx)' }}
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
              {timeError && <div style={{ fontSize: 11, color: 'var(--error)', fontWeight: 600, marginTop: -8 }}>{timeError}</div>}

              <div className="kp-section">
                <div className="kp-section-title">{t('newBooking.groupLimit')}</div>
                <div className="kp-limit" style={{ border: `1px solid ${maxClientsError ? 'var(--error)' : 'var(--border)'}` }}>
                  <span className="kp-limit-label">{t('newBooking.maxSpots')}</span>
                  <input
                    className="modal-input kp-limit-input"
                    type="number" min="1" max="50"
                    style={{ margin: 0, textAlign: 'center', padding: 0, background: 'var(--bg-card)', border: `1px solid ${maxClientsError ? 'var(--error)' : 'var(--border)'}`, borderRadius: '6px', fontWeight: 700 }}
                    value={newForm.maxClients}
                    onChange={e => setNewForm(f => ({ ...f, maxClients: e.target.value }))}
                  />
                </div>
                {maxClientsError && <div style={{ fontSize: 11, color: 'var(--error)', fontWeight: 600, marginTop: 4 }}>{maxClientsError}</div>}
              </div>
            </div>

            <div className="kp-section">
              <div className="kp-section-title">{t('newBooking.assignTrainer')}</div>
              <div className="kp-trainers">
                {trainers.map(t => {
                  const isActive = newBookingSlot.trainer === t.id;
                  return (
                    <div
                      key={t.id}
                      className="kp-trainer"
                      onClick={() => setNewBookingSlot(s => s ? { ...s, trainer: t.id } : s)}
                      style={{
                        border: `1px solid ${isActive ? t.color : 'var(--border)'}`,
                        background: isActive ? t.bg : 'var(--bg)',
                        boxShadow: isActive ? `0 4px 12px ${t.color}20` : 'none',
                        transform: isActive ? 'translateY(-1px)' : 'none'
                      }}
                    >
                      <div className="kp-trainer-av" style={{ background: isActive ? t.color : 'var(--border2)', color: isActive ? 'white' : 'var(--muted)' }}>{t.initials}</div>
                      <span className="kp-trainer-name" style={{ fontWeight: isActive ? 800 : 600, color: isActive ? t.color : 'var(--onyx)' }}>{t.name}</span>
                      {isActive && <span style={{ color: t.color, display: 'flex', flexShrink: 0 }}><Icons.Check /></span>}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="kp-foot">
            <button
              type="button"
              className="btn-ghost-sm"
              onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); closeNewForm(); }}
            >
              {t('newBooking.cancel')}
            </button>
            <button
              type="button"
              className="btn-primary-sm"
              disabled={hasErrors}
              style={{ opacity: hasErrors ? 0.5 : 1, cursor: hasErrors ? 'not-allowed' : 'pointer' }}
              onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); createBooking(); }}
            >
              {t('newBooking.create')}
            </button>
          </div>
        </div>
      </div>

      {showCatalogConfirm && (
        <ConfirmModal
          title={t('newBooking.createServiceConfirm.title')}
          message={t('newBooking.createServiceConfirm.message')}
          confirmText={t('newBooking.createServiceConfirm.confirm')}
          onConfirm={() => navigate('/dashboard/catalog')}
          onClose={() => setShowCatalogConfirm(false)}
        />
      )}
    </>,
    document.body
  );
};
