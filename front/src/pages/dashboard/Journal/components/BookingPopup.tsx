// src/components/modals/BookingPopup.tsx
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import * as Icons from '../../../../components/Icons';
import type { Booking, Hall, Trainer } from '../types';
import type { BookedClient, EligibleClient, LessonDetail } from '../../../../api/schedule/schedule.types';
import { AddClientModal as NewClientModal } from '../../Clients/components/modals/AddClientModal';
import { scheduleApi } from '../../../../api/schedule';
import { useSheetDrag, useSmoothHeight } from '../../../../components/ui/modal';
import { cachedLessonDetail, dropLessonDetail, fetchLessonDetail } from '../hooks/useLessonDetail';
import { errorMessage } from '../../../../api/errorMessage';
import { formatDate, formatIndexToTimeStr, isLessonStarted } from '../utils';
import { useServiceOptions, CREATE_SERVICE_OPTION } from '../hooks/useServiceOptions';
import { MoveBookingModal } from './modals/MoveBookingModal';
import { ClientQuickCard } from './ClientQuickCard';
import { LessonNotes } from './LessonNotes';
import { LessonFacts } from './lesson/LessonFacts';
import { BookedClients } from './lesson/BookedClients';
import { EligibleClientRow } from './lesson/EligibleClientRow';
import { EditorConsequence, LessonEditor } from './lesson/LessonEditor';
import { useLessonEditor } from './lesson/editor/useLessonEditor';
import type { LessonDraft } from './lesson/editor/editorModel';
import type { useJournalMutations } from '../hooks/useJournalMutations';
import type { HistoryEntry } from '../hooks/useUndoHistory';
import { useToast, ConfirmModal, QrShareModal } from '../../../../components/ui/index';
import { miniappLink } from '../../../../lib/miniapp';
import { useStudioCurrency, useStudioSettings } from '../../../../hooks/useStudioCurrency';

/** Больше строк скелета не нужно: дальше попап всё равно прокручивается. */
const SKELETON_ROWS = 6;
const EMPTY_CLIENTS: EligibleClient[] = [];
/** Столько строк «Добавить клиента» рисуется сразу. В списке вся база студии,
 *  и тысяча строк в попапе тормозила бы; поиск идёт по всем. */
const CLIENT_ROWS_LIMIT = 100;

interface BookingPopupProps {
  trainers: Trainer[];
  halls: Hall[];
  /** Участвует ли место в расписании: где нет (кресло барбершопа), правка
   *  занятия не предлагает сменить место — как и окно «Новое занятие». */
  spaceIsAxis?: boolean;
  /** Занятие перенесли на другой день — журнал показывает этот день. */
  onShowDate?: (date: string) => void;
  popupBooking: Booking;
  popupRef: React.RefObject<HTMLDivElement | null>;
  /** Попап уже закрыт и доигрывает уход. Он не перерисовывается вовсе (см.
   *  memo ниже), класс ухода и гашение кликов вешает Journal прямо в DOM. */
  leaving?: boolean;
  canEdit: boolean;
  timeStep: number;
  setPopupBooking: (b: Booking | null) => void;
  isEditingBooking: boolean;
  setIsEditingBooking: React.Dispatch<React.SetStateAction<boolean>>;
  editForm: LessonDraft;
  setEditForm: React.Dispatch<React.SetStateAction<LessonDraft>>;
  mutations: ReturnType<typeof useJournalMutations>;
  /** Сохранить правку. Индивидуальная запись отвечает, удался ли перенос:
   *  окно «Изменить время» по нему решает, закрываться ли. */
  onSave: (prev: Booking, next: Booking) => Promise<boolean> | void;
  deleteBooking: (id: number) => void;
  onAddClients: (clientIds: number[]) => void | Promise<void>;
  showToast: (msg: string) => void;
  pushHistoryEntry: (entry: HistoryEntry) => void;
}

const BookingPopupView: React.FC<BookingPopupProps> = ({
  trainers,
  halls,
  spaceIsAxis,
  onShowDate,
  popupBooking,
  popupRef,
  leaving = false,
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
  const { t, i18n } = useTranslation(['journal', 'clients']);
  const isCancelled = popupBooking.status === 'cancelled';
  const isResource = popupBooking.bookingMode === 'resource';

  // Правка занятия: черновик живёт в Journal (сетка рисует его живьём), здесь —
  // что в нём изменилось, что неверно и идёт ли сохранение.
  const editor = useLessonEditor(popupBooking, editForm);
  const [savingEdit, setSavingEdit] = useState(false);
  const [showCatalogConfirm, setShowCatalogConfirm] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [showMove, setShowMove] = useState(false);
  // Кого из записанных открыли карточкой. null — никого.
  const [peekClientId, setPeekClientId] = useState<number | null>(null);

  // Стейты добавления клиента
  const currency = useStudioCurrency();
  const [isAddingClient, setIsAddingClient] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedClients, setSelectedClients] = useState<number[]>([]);
  const [eligible, setEligible] = useState<{ lessonId: number; clients: EligibleClient[] } | null>(null);
  // «+ Новый клиент» в режиме добавления: форма Клиентов поверх попапа.
  // Заведённый встаёт первым и сразу отмечен — остаётся нажать «Добавить».
  const [creatingClient, setCreatingClient] = useState(false);
  const [freshClient, setFreshClient] = useState<{ lessonId: number; client: EligibleClient } | null>(null);
  const fresh = freshClient?.lessonId === popupBooking.id ? freshClient.client : null;

  // QR занятия: ссылка мини-приложения студии с номером занятия. Плакат и
  // картинку для сторис рисует общая модалка кита — здесь только что на них
  // написать. Индивидуальной записи (resource) код не положен: это чужое
  // забронированное время, звать на него посторонних некуда.
  const { data: studio } = useStudioSettings();
  const qrUrl = miniappLink(studio?.miniapp_url ?? '', {
    tab: 'sched',
    lesson: popupBooking.id,
    d: popupBooking.date,
  });
  const canShareQr = !isCancelled && !isResource && Boolean(studio?.miniapp_url);
  const qrSubtitle = [
    popupBooking.date
      ? formatDate(new Date(`${popupBooking.date}T00:00:00`), i18n.language, {
          weekday: 'short', day: 'numeric', month: 'long',
        })
      : null,
    `${formatIndexToTimeStr(popupBooking.timeStart)}–${formatIndexToTimeStr(popupBooking.timeEnd)}`,
    popupBooking.hall || null,
    trainers.find(tr => tr.id === popupBooking.trainer)?.full || null,
  ].filter(Boolean).join(' · ');

  const trainerName = trainers.find(tr => tr.id === popupBooking.trainer)?.full;
  // Подпись занятия в окне оплаты: «Хатха · 10:00».
  const lessonLabel = `${popupBooking.title} · ${formatIndexToTimeStr(popupBooking.timeStart)}`;

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

  const startEditing = () => {
    setEditForm({
      serviceId: popupBooking.serviceId,
      title: popupBooking.title, hall: popupBooking.hall,
      maxClients: String(popupBooking.maxClients),
      timeStart: popupBooking.timeStart, timeEnd: popupBooking.timeEnd,
      date: popupBooking.date ?? '', trainer: popupBooking.trainer,
    });
    setIsEditingBooking(true);
  };

  // Сохранение ждёт сервер: отказ (занято, поздно, не тот тренер) оставляет
  // черновик в окне, а не откатывает молча уже закрытую правку. Занятие,
  // уехавшее на другой день или к другому тренеру, со своего места в сетке
  // пропадает — попап закрывается, журнал показывает новый день.
  const saveEdit = async () => {
    if (!editor.canSave || savingEdit) return;
    const next: Booking = {
      ...popupBooking,
      title: editForm.title,
      hall: editForm.hall,
      maxClients: Number(editForm.maxClients),
      timeStart: editForm.timeStart,
      timeEnd: editForm.timeEnd,
      serviceId: editForm.serviceId,
      date: editForm.date || popupBooking.date,
      trainer: editForm.trainer,
    };
    setSavingEdit(true);
    const saved = await onSave(popupBooking, next);
    setSavingEdit(false);
    if (saved === false) return;
    setIsEditingBooking(false);
    const movedDay = editor.changes.includes('date');
    if (movedDay || editor.changes.includes('trainer')) {
      setPopupBooking(null);
      if (movedDay && next.date) onShowDate?.(next.date);
    } else {
      setPopupBooking(next);
    }
  };

  // Полные данные занятия: записанные (с оплатой и отзывами), адрес, уровень,
  // инвентарь. lessonId в состоянии переживает смену занятия без reset-эффекта.
  // Подтянутое заранее (наведение или касание карточки, useLessonDetail) берём
  // с первого кадра: попап открывается сразу целиком, а не дорастает на глазах.
  const qc = useQueryClient();
  const [loaded, setLoaded] = useState<{ lessonId: number; detail: LessonDetail | null; clients: BookedClient[] } | null>(() => {
    const cached = cachedLessonDetail(qc, popupBooking);
    return cached ? { lessonId: popupBooking.id, detail: cached, clients: cached.booked_clients } : null;
  });
  const current = loaded?.lessonId === popupBooking.id ? loaded : null;
  const bookedClients = current?.clients ?? null;
  const detail = current?.detail ?? null;

  // fresh — мимо кэша: после оплаты, отметки, записи данные уже другие.
  const loadLesson = (stale: () => boolean = () => false, fresh = true) =>
    fetchLessonDetail(qc, popupBooking, fresh)
      .then(d => {
        if (stale()) return;
        // Тот же ответ, что уже на экране (взят из кэша при открытии), — без
        // лишней перерисовки попапа.
        setLoaded(prev => (prev?.lessonId === popupBooking.id && prev.detail === d
          ? prev : { lessonId: popupBooking.id, detail: d, clients: d.booked_clients }));
      })
      .catch(() => { if (!stale()) setLoaded({ lessonId: popupBooking.id, detail: null, clients: [] }); });

  useEffect(() => {
    let stale = false;
    loadLesson(() => stale, false);
    return () => { stale = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [popupBooking.id, popupBooking.price, popupBooking.timeStart, popupBooking.timeEnd, popupBooking.trainer, popupBooking.clients, popupBooking.status]);

  // Закрыли — подтянутое о занятии больше не годится: всё, что в нём меняется,
  // меняется при открытом попапе, и следующее открытие спросит сервер заново.
  const lessonId = popupBooking.id;
  useEffect(() => () => dropLessonDetail(qc, lessonId), [qc, lessonId]);

  // Телефон: попап — шит снизу, и рука закрывает его смахиванием, как модалки
  // кита (useSheetDrag). Ссылка на закрытие стабильная: смена её посреди жеста
  // переподписала бы слушатели и оставила шит висеть под пальцем.
  const close = useCallback(() => setPopupBooking(null), [setPopupBooking]);
  useSheetDrag(popupRef, close, !leaving);
  // Догрузились записанные, открылась правка или поиск клиента — попап
  // доезжает до новой высоты, а не прыгает.
  useSmoothHeight(popupRef, !leaving);

  const clientsLoaded = eligible?.lessonId === popupBooking.id;
  const clientsList = clientsLoaded ? eligible!.clients : EMPTY_CLIENTS;
  // Список не пришёл — говорим об этом и даём повторить; раньше окно молча
  // показывало «Клиенты не найдены».
  const [eligibleFailed, setEligibleFailed] = useState<number | null>(null);
  const loadFailed = eligibleFailed === popupBooking.id;

  // Загружаем клиентов, когда открываем режим добавления. Кого можно записать
  // и чем покрыта запись каждого (абонемент, первое занятие, оплата на
  // месте), решает бэк — Zero Trust, фронт только рисует. lessonId в
  // состоянии (образец — booked/bookedClients выше) переживает смену занятия
  // без отдельного reset-эффекта.
  useEffect(() => {
    if (isAddingClient && !clientsLoaded && !loadFailed) {
      scheduleApi.getEligibleClients(popupBooking.id)
        .then(list => setEligible({ lessonId: popupBooking.id, clients: list }))
        .catch(() => setEligibleFailed(popupBooking.id));
    }
  }, [isAddingClient, clientsLoaded, loadFailed, popupBooking.id]);

  const patchBooked = (fn: (list: BookedClient[]) => BookedClient[]) =>
    setLoaded(b => b && { ...b, clients: fn(b.clients) });

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

  // Мемоизация поиска клиентов. Список уже отфильтрован бэком — без
  // записанных на это занятие (getEligibleClients) — тут только поиск.
  // Только что заведённый — первым; основание его записи приезжает со
  // следующей загрузкой списка, до неё строка без подписи.
  const freshRow = fresh ? clientsList.find(c => c.id === fresh.id) ?? null : null;
  const filteredClients = useMemo(() => {
    const q = searchQuery.toLowerCase();
    const found = clientsList.filter(c => c.id !== fresh?.id && (
      `${c.name} ${c.last_name ?? ''}`.toLowerCase().includes(q) ||
      (c.phone ?? '').includes(searchQuery)
    ));
    return fresh ? [freshRow ?? fresh, ...found] : found;
  }, [clientsList, searchQuery, fresh, freshRow]);

  return createPortal(
    <>
    <div
      ref={popupRef}
      className={`booking-popup${isEditingBooking ? ' is-editing' : ''}`}
    >
      {/* Ручка шита: на телефоне подсказывает, что его можно смахнуть вниз. */}
      <div className="bp-grabber" aria-hidden />
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
            background: isCancelled ? 'rgba(var(--ink),0.06)' : popupBooking.status === 'confirmed' ? 'rgba(163,201,168,0.15)' : 'rgba(216,140,154,0.15)',
            color: isCancelled ? 'var(--muted)' : popupBooking.status === 'confirmed' ? '#86b08c' : '#D88C9A',
            display: 'flex', alignItems: 'center', gap: 4, letterSpacing: '0.3px', textTransform: 'uppercase'
          }}>
            {popupBooking.status === 'confirmed' && <span style={{ transform: 'scale(0.85)' }}><Icons.Check /></span>}
            {isCancelled ? t('bookingPopup.cancelled') : popupBooking.status === 'confirmed' ? t('bookingPopup.confirmed') : t('bookingPopup.pending')}
          </div>

          {/* Крестик: на десктопе попап закрывался кликом мимо, но на телефоне
              он раскрыт шитом почти во весь экран — «мимо» там негде. */}
          <button
            type="button"
            className="bp-close"
            aria-label={t('common:buttons.close', { defaultValue: 'Закрыть' })}
            onClick={(e) => { e.stopPropagation(); setPopupBooking(null); }}
          >
            <Icons.X />
          </button>
        </div>
      </div>

      <div className="bp-body" style={{ position: 'relative', zIndex: 10, minHeight: '180px' }}>
        {!isEditingBooking && !isAddingClient && (services.find(s => s.id === popupBooking.serviceId)?.bundle_items?.length ?? 0) > 0 && (
          <div style={{ marginBottom: 16, color: 'var(--text2)', fontSize: 13 }}>
            {services.find(s => s.id === popupBooking.serviceId)?.bundle_items.map(p => p.name).join(' · ')}
          </div>
        )}
        
        {/* ОТМЕНЁННОЕ ЗАНЯТИЕ: сведения и причина, ничего интерактивного */}
        {isCancelled ? (
          <>
            <LessonFacts booking={popupBooking} detail={detail} booked={null} trainerName={trainerName} currency={currency} />
            {detail?.cancel_reason && (
              <div className="lc-tile">
                <span className="lc-tile-label">{t('lessonCard.cancelReason')}</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--onyx)', lineHeight: 1.5 }}>{detail.cancel_reason}</span>
              </div>
            )}
          </>

        /* РЕЖИМ ДОБАВЛЕНИЯ КЛИЕНТА */
        ) : isAddingClient ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', animation: 'fade-in 0.2s ease' }}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
            <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
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
            <button type="button" className="btn-ghost-sm bp-new-client" title={t('clients:addModal.title')}
                    aria-label={t('clients:addModal.title')}
                    onClick={e => { e.stopPropagation(); setCreatingClient(true); }}>
              <Icons.Plus /> <span className="bp-new-client-label">{t('clients:addModal.title')}</span>
            </button>
            </div>
            <div style={{ maxHeight: 260, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4, paddingRight: 4 }}>
              {loadFailed ? (
                <div className="ec-empty">
                  {t('common:errors.loadFailed')}
                  <div>
                    <button type="button" className="btn-ghost-sm" onClick={e => { e.stopPropagation(); setEligibleFailed(null); }}>
                      {t('common:errors.retry')}
                    </button>
                  </div>
                </div>
              ) : !clientsLoaded && !fresh ? (
                Array.from({ length: 4 }, (_, i) => <div key={i} className="ec-skeleton" aria-hidden />)
              ) : filteredClients.length === 0 ? (
                <div className="ec-empty">
                  {/* Пустой без поиска — значит, записывать некого вовсе: все
                      уже на занятии или база ещё пуста. С поиском — не нашлось. */}
                  {searchQuery
                    ? t('bookingPopup.noClientsFound')
                    : popupBooking.clients > 0 ? t('bookingPopup.allBooked') : t('bookingPopup.noClientsYet')}
                </div>
              ) : (
                <>
                  {filteredClients.slice(0, CLIENT_ROWS_LIMIT).map(c => {
                    const isSelected = selectedClients.includes(c.id);
                    return (
                      <EligibleClientRow
                        key={c.id}
                        client={c}
                        selected={isSelected}
                        pending={c === fresh}
                        currency={currency}
                        onToggle={() => setSelectedClients(prev =>
                          isSelected ? prev.filter(x => x !== c.id) : [...prev, c.id]
                        )}
                      />
                    );
                  })}
                  {filteredClients.length > CLIENT_ROWS_LIMIT && (
                    <div className="ec-empty">
                      {t('bookingPopup.moreClients', { rest: filteredClients.length - CLIENT_ROWS_LIMIT })}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

        /* РЕЖИМ РЕДАКТИРОВАНИЯ ЗАНЯТИЯ */
        ) : isEditingBooking ? (
          <LessonEditor
            booking={popupBooking}
            draft={editForm}
            setDraft={setEditForm}
            state={editor}
            trainers={trainers}
            halls={halls}
            showHalls={spaceIsAxis !== false}
            timeStep={timeStep}
            serviceOptions={serviceOptions}
            onServiceChange={handleServiceChange}
          />
          
        /* ОБЫЧНЫЙ РЕЖИМ ПРОСМОТРА: всё о занятии, заметка, записанные */
        ) : (
          <>
            <LessonFacts booking={popupBooking} detail={detail} booked={bookedClients} trainerName={trainerName} currency={currency}
                         loading={!current} />

            {/* Заметка занятия — ДО списка записанных: это про само занятие,
                а не про конкретного человека. */}
            <LessonNotes
              booking={popupBooking}
              canEdit={canEdit}
              mutations={mutations}
              onSaved={setPopupBooking}
            />


            {/* Пока записанные едут с сервера — их силуэты в том же количестве:
                попап сразу нужной высоты и не дорастает, когда придёт ответ. */}
            {!bookedClients && popupBooking.clients > 0 && (
              <RosterSkeleton count={popupBooking.clients} />
            )}

            {bookedClients && bookedClients.length > 0 && (
              <BookedClients
                clients={bookedClients}
                canEdit={canEdit}
                removable={!isResource}
                started={isLessonStarted(popupBooking)}
                currency={currency}
                price={popupBooking.price}
                lessonLabel={lessonLabel}
                mutations={mutations}
                patch={patchBooked}
                reload={() => { void loadLesson(); }}
                showToast={showToast}
                onPeek={setPeekClientId}
                onRemove={removeClient}
              />
            )}
          </>
        )}
      </div>

      {/* КНОПКИ ДЕЙСТВИЙ: у отменённого занятия их нет вовсе */}
      {!isCancelled && (
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
              onClick={async (e) => {
                e.stopPropagation();
                const ids = selectedClients;
                setIsAddingClient(false);
                setSelectedClients([]);
                setSearchQuery('');
                setEligible(null); // подходящие пересчитаются заново — записанные уйдут из списка
                await onAddClients(ids);
                // Обновляем список записанных прямо в попапе — новые клиенты видны без перезагрузки модалки
                void loadLesson();
              }}
            >
              <Icons.UserPlus /> {t('bookingPopup.add')} {selectedClients.length > 0 ? `(${selectedClients.length})` : ''}
            </button>
          </>
        ) : isEditingBooking ? (
          <>
            {editor.notifies && <EditorConsequence booked={popupBooking.clients} />}
            <button className="bp-btn ghost text-btn" disabled={savingEdit}
                    onClick={(e) => { e.stopPropagation(); setIsEditingBooking(false); }}>
              {t('bookingPopup.cancel')}
            </button>

            {/* Нечего сохранять — кнопка спит: «Сохранить» без изменений
                отправил бы пустую правку и показал «Занятие обновлено». */}
            <button
              className="bp-btn primary text-btn"
              disabled={!editor.canSave || savingEdit}
              onClick={(e) => { e.stopPropagation(); void saveEdit(); }}
            >
              {savingEdit ? t('common:buttons.saving') : t('bookingPopup.save')}
            </button>
          </>
        ) : (
          <>
            {canEdit && !isResource && (
              <>
                <button className="bp-btn primary text-btn" onClick={(e) => { e.stopPropagation(); setIsAddingClient(true); }}>
                  <Icons.UserPlus /> {t('bookingPopup.add')}
                </button>

                {/* Только карандаш: рядом встали QR и удаление, и три подписи
                    подряд выдавливали корзину за край попапа. Смысл кнопки
                    иконка несёт сама, название остаётся подсказкой. */}
                <button
                  className="bp-btn ghost icon-only"
                  title={t('bookingPopup.editLesson')}
                  aria-label={t('bookingPopup.edit')}
                  onClick={(e) => {
                    e.stopPropagation();
                    startEditing();
                  }}
                >
                  <Icons.Edit />
                </button>

              </>
            )}

            {/* У индивидуальной записи один клиент и одна услуга — добавлять
                сюда некого, и главное, что с ней делают из карточки, — меняют
                время. Поэтому это главная кнопка подвала, на месте «Добавить»
                у группового. На телефоне она — единственный способ сдвинуть
                или растянуть запись: жестов там нет. */}
            {canEdit && isResource && (
              <button className="bp-btn primary text-btn" onClick={e => { e.stopPropagation(); setShowMove(true); }}>
                <Icons.Clock /> {t('bookingPopup.changeTime')}
              </button>
            )}

            {canShareQr && (
              <button
                className="bp-btn ghost icon-only"
                title={t('common:qr.lessonAction')}
                aria-label={t('common:qr.lessonAction')}
                onClick={(e) => { e.stopPropagation(); setShowQr(true); }}
              >
                <Icons.QrCode />
              </button>
            )}

            {canEdit && (
              <button className="bp-btn danger icon-only" title={t('bookingPopup.deleteLesson')} onClick={() => deleteBooking(popupBooking.id)}>
                <Icons.Trash />
              </button>
            )}
          </>
        )}
      </div>
      )}
    </div>

    {showQr && (
      <QrShareModal
        url={qrUrl}
        kicker={studio?.name}
        title={popupBooking.title}
        subtitle={qrSubtitle}
        caption={t('common:qr.lessonCaption')}
        fileName={popupBooking.title}
        onClose={() => setShowQr(false)}
      />
    )}

    {showMove && (
      <MoveBookingModal
        booking={popupBooking}
        trainerName={trainers.find(tr => tr.id === popupBooking.trainer)?.full}
        onSave={async next => {
          const saved = await onSave(popupBooking, next);
          if (saved) setPopupBooking(null);
          return saved === true;
        }}
        onClose={() => setShowMove(false)}
      />
    )}

    {peekClientId != null && (
      <ClientQuickCard clientId={peekClientId} onClose={() => setPeekClientId(null)}/>
    )}

    {showCatalogConfirm && (
      <ConfirmModal
        title={t('bookingPopup.createServiceConfirm.title')}
        message={t('bookingPopup.createServiceConfirm.message')}
        confirmText={t('bookingPopup.createServiceConfirm.confirm')}
        onConfirm={() => navigate('/dashboard/catalog')}
        onClose={() => setShowCatalogConfirm(false)}
      />
    )}
    {/* Слой выше попапа (9000–10000). Обёртка гасит всплытие React-событий из
        портала формы — иначе клики в ней дошли бы до сетки под попапом. */}
    <div onMouseDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()} onPointerDown={e => e.stopPropagation()}>
      <NewClientModal isOpen={creatingClient} layer={10050} onClose={() => setCreatingClient(false)}
        onSuccess={(form, id) => {
          // Строка-заглушка до ответа сервера: чем покрыта запись нового
          // клиента (первое занятие или оплата на месте), решает он, поэтому
          // список тут же перезагружается.
          setFreshClient({ lessonId: popupBooking.id, client: {
            id, name: form.name.trim(), last_name: null, phone: form.phone || null,
            avatar_color: null, funding: 'pay', classes_left: null, trial_percent: null, trial_amount: null,
          } });
          setEligible(null);
          setSelectedClients(prev => [id, ...prev.filter(x => x !== id)]);
        }} />
    </div>
    </>,
    document.body
  );
};

/**
 * Уходящий попап (leaving) не перерисовывается: его закрыли, и всё, что ему
 * осталось, — доиграть анимацию. Перерисовка ~400 элементов ради одного
 * класса стоила бы кадра ровно в начале этой анимации — уход начинался с
 * запинки. Класс и гашение кликов ставит Journal прямо в DOM.
 */
export const BookingPopup = React.memo(BookingPopupView, (_prev, next) => next.leaving === true);

/** Силуэты строк записанных — на время, пока список едет с сервера. */
function RosterSkeleton({ count }: { count: number }) {
  return (
    <div className="lc-roster lc-roster-skeleton" aria-hidden>
      <div className="lc-eyebrow lc-skel-line" />
      <div className="lc-roster-list">
        {Array.from({ length: Math.min(count, SKELETON_ROWS) }, (_, i) => (
          <div key={i} className="lc-person lc-skel-person" />
        ))}
      </div>
    </div>
  );
}
