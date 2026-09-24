import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import * as Icons from '../../../../../components/Icons';
import { Select, NotePhotos, NoteDropZone } from '../../../../../components/ui/index';
import { errorMessage } from '../../../../../api/errorMessage';
import { useBusinessTerms } from '../../../../../hooks/useBusinessTerms';
import { useNotePhotos } from '../../../../../hooks/useNotePhotos';
import { formatMoney } from '../../../../../lib/money';
import { parseTimeToIndex, listedTimes } from '../../utils';
import type { Trainer } from '../../types';
import { ResourceClientPicker } from './ResourceClientPicker';
import { ResourceTimeField } from '../ResourceTimeField';
import { useResourceBooking } from '../../hooks/useResourceBooking';

type Props = {
  trainers: Trainer[];
  /** Мастер колонки, по которой кликнули, и время клетки. */
  teacherId: number | null;
  defaultTime: string;
  defaultDate: string;
  defaultServiceId?: number;
  /** Шаг сетки журнала (мин): по нему строится выпадающий список времени. */
  timeStep: number;
  newFormPos: { x: number; y: number };
  modalRef: React.RefObject<HTMLDivElement | null>;
  onClose: () => void;
  onCreated: () => void;
  /** Превью в сетке следует за выбором: название услуги и взятое время. */
  onPreview: (preview: { title: string; start?: number; end?: number; bufferAfter?: number }) => void;
};

/**
 * Индивидуальная запись у клетки сетки — в том же клавиатурном окне, что и
 * новое занятие (NewBookingModal): открывается рядом со слотом, а превью в
 * сетке показывает, куда ляжет запись.
 *
 * Раскладка та же, что у нового занятия: слева — что и когда (клиент, услуга,
 * филиал, время начала, дата внизу), справа — кто (мастера) и заметка внизу.
 *
 * Только десктоп: на телефоне та же запись — шит ResourceBookingModal, окно у
 * клетки там негде разместить. Логика у обоих одна — hooks/useResourceBooking.
 *
 * Время начала — то, что назвал человек (клетка, ввод руками или список).
 * Условия под него берутся сами, как только известен клиент и это время
 * свободно: спрашивать второй раз незачем.
 */
export function ResourceKeypadModal({
  trainers, teacherId: initialTeacherId, defaultTime, defaultDate, defaultServiceId, timeStep,
  newFormPos, modalRef, onClose, onCreated, onPreview,
}: Props) {
  const { t } = useTranslation(['journal', 'common']);
  const terms = useBusinessTerms('resource');
  const booking = useResourceBooking({
    onClose, onCreated, defaultDate, defaultServiceId, teacherId: initialTeacherId,
  });
  const { choice, serviceId, branchId, teacherId, chosenService, loadingChoice, quote, quoting, saving, slots, reason } = booking;
  const quotedTime = quote?.terms.domain.local_start.slice(11, 16);
  const pickedTeacher = choice.masterOptions.find(m => m.teacher_id === teacherId);
  const busy = loadingChoice || saving;

  const [typedTime, setTypedTime] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const notePhotos = useNotePhotos();
  // Свободные начала сервер считает по длительности услуги и её буферам:
  // 30-минутная стрижка встаёт в любой свободный получас, а не только в час.
  const free = slots.map(s => s.local_start.slice(11, 16));
  // Клетка сетки — это час. Если ровно её начало занято, берём первое
  // свободное начало в том же часу: человек показал час, а не минуту.
  // Набранное руками время — буквально то, что набрано.
  const cellHour = defaultTime.slice(0, 2);
  const fromCell = free.includes(defaultTime) ? defaultTime
    : free.find(time => time.slice(0, 2) === cellHour && time > defaultTime) ?? defaultTime;
  const wantedTime = typedTime ?? fromCell;
  const wantedFree = free.includes(wantedTime);
  // Стойке сервер отдаёт свободные начала поминутно — в списке их сотни.
  // Показываем шаг сетки журнала и первое начало каждого свободного окна
  // (15:26 сразу после буфера): остальные минуты набираются руками.
  const listed = listedTimes(free, timeStep);

  // Клиент выбран, названное время свободно — берём условия под него. Один раз
  // на каждый набор выбора: отказ сервера (нет абонемента) не должен
  // повторяться запросом на каждый рендер.
  const autoPicked = useRef<string | null>(null);
  const autoKey = `${booking.client}|${serviceId}|${branchId}|${teacherId}|${booking.date}|${wantedTime}`;
  const { pick } = booking;
  useEffect(() => {
    if (booking.client == null || quoting || quotedTime === wantedTime || autoPicked.current === autoKey) return;
    const slot = slots.find(s => s.local_start.slice(11, 16) === wantedTime);
    if (!slot) return;
    autoPicked.current = autoKey;
    void pick(slot);
  }, [booking.client, quoting, quotedTime, wantedTime, autoKey, slots, pick]);

  // Превью в сетке — сразу длиной с услугу: детская стрижка занимает 30
  // минут, а не час клетки. Мастер выбран — его время (у него оно своё),
  // после условий сервера — длительность из них.
  const title = chosenService?.name ?? '';
  const duration = quote?.terms.duration_min
    ?? booking.durationAt(teacherId, serviceId) ?? chosenService?.duration_min;
  const bufferAfter = chosenService?.buffer_after_min ?? 0;
  useEffect(() => {
    if (duration == null || duration <= 0) { onPreview({ title }); return; }
    const start = parseTimeToIndex(wantedTime);
    // Буфер после — тоже в превью: запись займёт мастера и на уборку.
    onPreview({ title, start, end: start + duration / 60, bufferAfter: bufferAfter / 60 });
  }, [title, wantedTime, duration, bufferAfter, onPreview]);

  const dayLabel = booking.date.split('-').reverse().join('.');
  const ready = !!quote && quotedTime === wantedTime && !quoting;

  // Строка под полем времени: почему записать пока нельзя.
  const timeNote = booking.slotsError ? null
    : booking.slotsLoading || loadingChoice ? t('common:loading')
    : serviceId == null || branchId == null ? t('journal:resourceBooking.chooseDetails')
    : slots.length === 0
      ? (reason === 'config_incomplete' ? t('journal:resourceBooking.configIncomplete')
        : terms.ready ? terms.message('empty_slots') : t('journal:resourceBooking.noSlots'))
    : !wantedFree ? t('journal:resourceBooking.moveBusy')
    : booking.client == null ? t('journal:resourceBooking.chooseClient')
    : null;

  return createPortal(
    <>
      <div className="kp-backdrop" style={{ position: 'fixed', inset: 0, zIndex: 200 }}
           onMouseDown={() => { if (!saving) onClose(); }} />
      <div className="kp-anchor" style={{ position: 'fixed', left: newFormPos.x, top: newFormPos.y, zIndex: 210 }}
           onMouseDown={e => e.stopPropagation()}>
        <div className="keypad-modal" ref={modalRef}>
          <div className="kp-head">
            <div className="kp-head-l">
              <div className="kp-head-icon"><Icons.Plus /></div>
              <div>
                <div className="kp-head-title">{t('journal:resourceBooking.title')}</div>
                <div className="kp-head-sub">
                  {dayLabel} · <span style={{ color: 'var(--peach)', fontWeight: 800 }}>{wantedTime}</span>
                </div>
              </div>
            </div>
            <button type="button" className="btn-icon" onClick={onClose} disabled={saving}><Icons.X /></button>
          </div>

          <div className="kp-grid">
            <div className="kp-col">
              <div className="kp-section">
                <ResourceClientPicker value={booking.client} disabled={saving}
                                      onChange={booking.setClient} labelClass="kp-section-title" />
              </div>

              <div className="kp-section">
                <div className="kp-section-title">{t('journal:resourceBooking.service')}</div>
                <Select value={serviceId ? String(serviceId) : ''} onChange={v => booking.setServiceId(Number(v))}
                        disabled={busy} searchable placeholder={t('journal:newBooking.servicePlaceholder')}
                        emptyText={t('journal:resourceBooking.noServices')}
                        options={choice.serviceOptions.map(s => ({ value: String(s.id), label: s.name, hint: booking.serviceHint(s) }))} />
                {booking.loadError && <div className="kp-error" role="alert">{errorMessage(booking.loadError, t)}</div>}
                {/* Цена — рядом с мастером: у одной услуги у разных мастеров
                    она своя, и сумма без имени не отвечает на «почему столько». */}
                {pickedTeacher && serviceId != null && (
                  <div className="kp-price-row">
                    <span className="kp-price-who">{`${pickedTeacher.name} ${pickedTeacher.last_name ?? ''}`.trim()}</span>
                    <span className="kp-price-v">{booking.priceAt(pickedTeacher.teacher_id, serviceId)}</span>
                  </div>
                )}
              </div>

              {/* Филиал один — выбирать нечего, но запись к нему всё равно привязана. */}
              {choice.branchOptions.length > 1 && (
                <div className="kp-section">
                  <div className="kp-section-title">{t('journal:resourceBooking.branch')}</div>
                  <Select value={branchId ? String(branchId) : ''} disabled={busy}
                          onChange={v => booking.setBranchId(Number(v))}
                          options={choice.branchOptions.map(b => ({ value: String(b.id), label: b.name }))} />
                </div>
              )}

              <div className="kp-section" onClick={e => e.stopPropagation()}>
                <div className="kp-section-title">{t('journal:newBooking.start')}</div>
                <ResourceTimeField value={wantedTime} free={listed} disabled={saving} onCommit={setTypedTime} />
                {booking.slotsError ? (
                  <div className="kp-error" role="alert">{errorMessage(booking.slotsError, t)}{' '}
                    <button type="button" className="kp-link" onClick={() => void booking.refreshSlots()}>{t('common:errors.retry')}</button>
                  </div>
                ) : timeNote && (
                  <div className={!wantedFree && slots.length > 0 ? 'kp-error' : 'kp-hint'}>{timeNote}</div>
                )}
              </div>

              <div className="kp-section">
                <div className="kp-section-title">{t('journal:resourceBooking.date')}</div>
                <input className="modal-input kp-date-input" type="date" value={booking.date} disabled={saving}
                       onChange={e => booking.setDate(e.target.value)} />
              </div>
            </div>

            <div className="kp-col">
              <div className="kp-section kp-trainers-sec">
                <div className="kp-section-title">{terms.staff?.singular ?? t('journal:resourceBooking.staff')}</div>
                <div className="kp-trainers">
                  <MasterCard active={teacherId == null} label={t('journal:resourceBooking.anyStaff')}
                              initials="∗" hint={chosenService ? booking.rangeOf(chosenService) : undefined}
                              disabled={busy} onClick={() => booking.setTeacherId(null)} />
                  {/* Только те, кто ведёт услугу. Мастер другого филиала
                      остаётся: выбрали его — филиал переключится сам. */}
                  {choice.masterOptions.map(person => {
                    const look = trainers.find(tr => tr.id === person.teacher_id);
                    return (
                      <MasterCard key={person.teacher_id} active={teacherId === person.teacher_id}
                                  label={`${person.name} ${person.last_name ?? ''}`.trim()}
                                  initials={look?.initials ?? person.name.slice(0, 1)}
                                  color={look?.color} bg={look?.bg}
                                  hint={booking.priceAt(person.teacher_id, serviceId)}
                                  disabled={busy} onClick={() => booking.setTeacherId(person.teacher_id)} />
                    );
                  })}
                </div>
              </div>

              {/* Заметка — внизу правой колонки, как у нового занятия: ложится
                  в занятие, которое создаст запись. */}
              <div className="kp-note-row" onClick={e => e.stopPropagation()}>
                <div className="kp-section-title">{t('journal:lessonNotes.short')}</div>
                <NoteDropZone onFiles={notePhotos.add}>
                  <textarea className="kp-note-input" placeholder={t('journal:lessonNotes.placeholder')}
                            value={notes} disabled={saving} onChange={e => setNotes(e.target.value)} />
                </NoteDropZone>
                <NotePhotos photos={notePhotos.photos} pending={notePhotos.pending}
                            onAdd={notePhotos.add} onRemove={notePhotos.remove} zIndex={400} />
              </div>
            </div>
          </div>

          <div className="kp-foot">
            {ready && quote && (
              <span className="kp-foot-sum">
                {quote.terms.duration_min} {t('common:units.min')} · {formatMoney(quote.terms.domain.funding.price, quote.terms.domain.funding.currency)}
              </span>
            )}
            <button type="button" className="btn-ghost-sm" disabled={saving} onClick={onClose}>
              {t('common:buttons.cancel')}
            </button>
            <button type="button" className="btn-primary-sm" disabled={!ready || saving || notePhotos.pending.length > 0}
                    style={{ opacity: !ready || saving ? 0.5 : 1, cursor: !ready || saving ? 'not-allowed' : 'pointer' }}
                    onClick={() => void booking.confirm({ notes: notes.trim(), photos: notePhotos.photos })}>
              {terms.ready ? terms.message('confirm_booking') : t('common:buttons.create')}
            </button>
          </div>
        </div>
      </div>
    </>,
    document.body,
  );
}

function MasterCard({ active, label, initials, hint, color = 'var(--peach)', bg = 'rgba(249,160,139,0.1)', disabled, onClick }: {
  active: boolean; label: string; initials: string; hint?: string;
  color?: string; bg?: string; disabled: boolean; onClick: () => void;
}) {
  return (
    <button type="button" className="kp-trainer" disabled={disabled} onClick={onClick}
            style={{
              border: `1px solid ${active ? color : 'var(--border)'}`,
              background: active ? bg : 'var(--bg)',
              // Цвет тренера — hex, к нему дописывается прозрачность; у «любого» — токен.
              boxShadow: active ? `0 4px 12px ${color.startsWith('#') ? `${color}20` : 'rgba(249,160,139,0.12)'}` : 'none',
              transform: active ? 'translateY(-1px)' : 'none',
            }}>
      <span className="kp-trainer-av" style={{ background: active ? color : 'var(--border2)', color: active ? 'white' : 'var(--muted)' }}>{initials}</span>
      <span className="kp-trainer-name" style={{ fontWeight: active ? 800 : 600, color: active ? color : 'var(--onyx)' }}>{label}</span>
      {hint && <span className="kp-trainer-price">{hint}</span>}
      {active && <span style={{ color, display: 'flex', flexShrink: 0 }}><Icons.Check /></span>}
    </button>
  );
}
