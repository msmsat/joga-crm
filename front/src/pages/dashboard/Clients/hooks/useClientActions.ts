import { useState, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { EventFilterTab } from '../types';
import type { ClientUpdate } from '../../../../api/clients/clients.types';
import { scheduleApi } from '../../../../api/schedule';
import type { Lesson } from '../../../../api/schedule/schedule.types';
import { useToast } from '../../../../components/ui/Toast';
import { errorMessage } from '../../../../api/errorMessage';
import { useClientMutations } from './useClientsList';
import { clientsApi } from '../../../../api/clients/clients.api';

export interface NoteItem {
  id: number;
  text: string;
  date: string;
}

export function useClientActions(clientId: number) {
  const { t } = useTranslation('clients');
  const toast = useToast();
  const mutations = useClientMutations();

  const [showTagPanel, setShowTagPanel]   = useState(false);
  const [editingNoteId, setEditingNoteId] = useState<number | null>(null);
  const [editingNoteText, setEditingNoteText] = useState('');
  const [isAddingNote, setIsAddingNote]   = useState(false);
  const [deletingNoteId, setDeletingNoteId] = useState<number | null>(null);
  const [newNoteText, setNewNoteText]     = useState('');
  const [showMessage, setShowMessage]     = useState(false);
  const [messageText, setMessageText]     = useState('');
  const [showBooking, setShowBooking]     = useState(false);
  const [showBonus, setShowBonus]         = useState(false);
  const [selectedBonus, setSelectedBonus] = useState<string | null>(null);
  const [eventFilter, setEventFilter]     = useState<EventFilterTab>('all');
  const [bookingDate, setBookingDate]     = useState(0); // смещение в днях от сегодня (абсолютное, не индекс окна)
  const [bookingWindowStart, setBookingWindowStart] = useState(0); // начало видимого окна из 7 дней
  const [bookingLessons, setBookingLessons] = useState<Lesson[]>([]);
  const [bookingLessonId, setBookingLessonId] = useState<number | null>(null);

  // Панель больше не перемонтируется при смене клиента (без миганий/скачков) —
  // закрываем открытые подпанели вручную вместо остатка со старого клиента.
  useEffect(() => {
    setShowTagPanel(false);
    setEditingNoteId(null);
    setIsAddingNote(false);
    setDeletingNoteId(null);
    setShowMessage(false);
    setShowBooking(false);
    setShowBonus(false);
    setSelectedBonus(null);
    setEventFilter('all');
    setBookingDate(0);
    setBookingWindowStart(0);
  }, [clientId]);

  const toggleFreeze = useCallback((frozen: boolean) => {
    mutations.freeze(clientId, !frozen).catch((e: Error) => toast.error(errorMessage(e, t)));
  }, [clientId, mutations, toast, t]);

  const toggleTagPanel = useCallback(() => {
    setShowTagPanel(prev => !prev);
  }, []);

  const addTag = useCallback((tag: string, existingTags: string[]) => {
    const trimmed = tag.trim();
    if (!trimmed || existingTags.includes(trimmed)) return;
    mutations.addTag(clientId, trimmed).catch((e: Error) => toast.error(errorMessage(e, t)));
  }, [clientId, mutations, toast, t]);

  const removeTag = useCallback((tag: string) => {
    mutations.removeTag(clientId, tag).catch((e: Error) => toast.error(errorMessage(e, t)));
  }, [clientId, mutations, toast, t]);

  const startEditNote = useCallback((id: number, text: string) => {
    setEditingNoteId(id);
    setEditingNoteText(text);
    setIsAddingNote(false);
  }, []);

  const saveNote = useCallback((id: number) => {
    const text = editingNoteText;
    setEditingNoteId(null);
    mutations.updateNote(clientId, id, text).catch((e: Error) => toast.error(errorMessage(e, t)));
  }, [editingNoteText, clientId, mutations, toast, t]);

  const cancelEditNote = useCallback(() => {
    setEditingNoteId(null);
    setEditingNoteText('');
  }, []);

  const requestDeleteNote = useCallback((id: number) => {
    setDeletingNoteId(id);
  }, []);

  const cancelDeleteNote = useCallback(() => {
    setDeletingNoteId(null);
  }, []);

  const confirmDeleteNote = useCallback(() => {
    if (deletingNoteId == null) return Promise.resolve();
    return mutations.deleteNote(clientId, deletingNoteId)
      .then(() => setDeletingNoteId(null))
      .catch((e: Error) => { toast.error(errorMessage(e, t)); throw e; });
  }, [clientId, deletingNoteId, mutations, toast, t]);

  const startAddNote = useCallback(() => {
    setIsAddingNote(true);
    setEditingNoteId(null);
    setNewNoteText('');
  }, []);

  const saveNewNote = useCallback(() => {
    const text = newNoteText.trim();
    if (!text) return;
    setIsAddingNote(false);
    setNewNoteText('');
    mutations.createNote(clientId, text).catch((e: Error) => toast.error(errorMessage(e, t)));
  }, [newNoteText, clientId, mutations, toast, t]);

  const cancelAddNote = useCallback(() => {
    setIsAddingNote(false);
    setNewNoteText('');
  }, []);

  const toggleMessage = useCallback(() => {
    setShowMessage(prev => !prev);
    setShowBooking(false);
    setShowBonus(false);
  }, []);

  const sendMessage = useCallback((phone: string) => {
    setShowMessage(false);
    const text = messageText.trim();
    setMessageText('');
    const digits = phone.replace(/\D/g, '');
    if (!digits) { toast.error(t('panel.toasts.noPhone')); return; }
    // WhatsApp: wa.me принимает номер без «+» и опциональный предзаполненный текст.
    const url = `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
    window.open(url, '_blank', 'noopener');
  }, [messageText, toast, t]);

  const toggleBooking = useCallback(() => {
    setShowBooking(prev => !prev);
    setShowMessage(false);
    setShowBonus(false);
  }, []);

  // Листание окна дат на 7 дней; назад раньше сегодня не уходим.
  const shiftBookingWindow = useCallback((deltaDays: number) => {
    setBookingWindowStart(prev => Math.max(0, prev + deltaDays));
  }, []);

  // Занятия на выбранный день панели записи (bookingDate — смещение от сегодня)
  useEffect(() => {
    if (!showBooking) return;
    const d = new Date();
    d.setDate(d.getDate() + bookingDate);
    const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    setBookingLessonId(null);
    scheduleApi.getLessons({ date_from: day, date_to: day })
      .then(setBookingLessons)
      .catch(() => setBookingLessons([]));
  }, [showBooking, bookingDate]);

  const confirmBooking = useCallback(() => {
    if (bookingLessonId == null) return;
    mutations.book(clientId, bookingLessonId)
      .then(() => {
        setShowBooking(false);
        toast.success(t('panel.toasts.bookingCreated'));
      })
      .catch((e: Error) => toast.error(errorMessage(e, t) || t('panel.toasts.bookingFailed')));
  }, [clientId, bookingLessonId, mutations, toast, t]);

  const toggleBonus = useCallback(() => {
    setShowBonus(prev => !prev);
    setShowMessage(false);
    setShowBooking(false);
    setSelectedBonus(null);
  }, []);

  const selectBonus = useCallback((id: string, label: string, points: number) => {
    setSelectedBonus(id);
    mutations.addBonus(clientId, points, label)
      .then(() => {
        setTimeout(() => {
          setShowBonus(false);
          setSelectedBonus(null);
          toast.success(t('panel.toasts.bonusApplied', { label }));
        }, 600);
      })
      .catch((e: Error) => { setSelectedBonus(null); toast.error(errorMessage(e, t)); });
  }, [clientId, mutations, toast, t]);

  const copyToClipboard = useCallback((value: string) => {
    navigator.clipboard.writeText(value).then(() => toast.success(t('panel.toasts.copied')));
  }, [toast, t]);

  const handleCall = useCallback((phone: string) => {
    if (!phone) { toast.error(t('panel.toasts.noPhone')); return; }
    window.location.href = `tel:${phone.replace(/\s/g, '')}`;
  }, [toast, t]);

  const remindAboutSubscription = useCallback(() => {
    clientsApi.sendSubscriptionReminder(clientId)
      .then(result => {
        if (result.ok) toast.success(t('panel.abonement.reminderSent'));
        else toast.error(result.message);
      })
      .catch((e: Error) => toast.error(errorMessage(e, t)));
  }, [clientId, toast, t]);

  return {
    toggleFreeze,
    showTagPanel, toggleTagPanel, addTag, removeTag,
    editingNoteId, editingNoteText, setEditingNoteText,
    startEditNote, saveNote, cancelEditNote,
    deletingNoteId, requestDeleteNote, cancelDeleteNote, confirmDeleteNote,
    isAddingNote, newNoteText, setNewNoteText, startAddNote, saveNewNote, cancelAddNote,
    showMessage, messageText, setMessageText, toggleMessage, sendMessage,
    showBooking, toggleBooking, confirmBooking,
    bookingDate, setBookingDate,
    bookingWindowStart, shiftBookingWindow,
    bookingLessons, bookingLessonId, setBookingLessonId,
    showBonus, selectedBonus, toggleBonus, selectBonus,
    eventFilter, setEventFilter,
    copyToClipboard, handleCall,
    remindAboutSubscription,
    updateStatus: (status: string) => mutations.updateStatus(clientId, status).catch((e: Error) => toast.error(errorMessage(e, t))),
    updateField: (field: 'phone' | 'email' | 'birth_date' | 'city', value: string | null) =>
      mutations.update(clientId, { [field]: value } as ClientUpdate).catch((e: Error) => toast.error(errorMessage(e, t))),
    updateRegistrationDate: (date: string) => mutations.updateRegistrationDate(clientId, date).catch((e: Error) => toast.error(errorMessage(e, t))),
  };
}
