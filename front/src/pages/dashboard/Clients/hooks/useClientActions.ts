import { useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { EventFilterTab } from '../types';
import type { ClientUpdate } from '../../../../api/clients/clients.types';
import { queryKeys } from '../../../../api/queryKeys';
import { useToast } from '../../../../components/ui/Toast';
import { errorMessage } from '../../../../api/errorMessage';
import { useClientMutations } from './useClientsList';
import { clientsApi } from '../../../../api/clients/clients.api';

export interface NoteItem {
  id: number;
  text: string;
  photos: string[];
  date: string;
}

export function useClientActions(clientId: number) {
  const { t } = useTranslation('clients');
  const toast = useToast();
  const mutations = useClientMutations();
  const qc = useQueryClient();

  const [showTagPanel, setShowTagPanel]   = useState(false);
  const [editingNoteId, setEditingNoteId] = useState<number | null>(null);
  const [editingNoteText, setEditingNoteText] = useState('');
  const [isAddingNote, setIsAddingNote]   = useState(false);
  const [deletingNoteId, setDeletingNoteId] = useState<number | null>(null);
  // Черновик заметки живёт в окне правки (NoteEditorModal), здесь — только
  // то, С ЧЕМ его открыли: текст и снимки существующей заметки.
  const [notePhotos, setNotePhotos]       = useState<string[]>([]);
  const [showBonus, setShowBonus]         = useState(false);
  const [selectedBonus, setSelectedBonus] = useState<string | null>(null);
  const [eventFilter, setEventFilter]     = useState<EventFilterTab>('all');

  // Панель больше не перемонтируется при смене клиента (без миганий/скачков) —
  // закрываем открытые подпанели вручную вместо остатка со старого клиента.
  // Прямо в рендере, а не эффектом: иначе новый клиент на кадр показывается с
  // открытыми панелями предыдущего.
  const [syncedClientId, setSyncedClientId] = useState(clientId);
  if (syncedClientId !== clientId) {
    setSyncedClientId(clientId);
    setShowTagPanel(false);
    setEditingNoteId(null);
    setIsAddingNote(false);
    setDeletingNoteId(null);
    setNotePhotos([]);
    setShowBonus(false);
    setSelectedBonus(null);
    setEventFilter('all');
  }

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

  const startEditNote = useCallback((id: number, text: string, photos: string[]) => {
    setEditingNoteId(id);
    setEditingNoteText(text);
    setNotePhotos(photos);
    setIsAddingNote(false);
  }, []);

  const saveNote = useCallback((id: number, text: string, photos: string[]) => {
    setEditingNoteId(null);
    setNotePhotos([]);
    return mutations.updateNote(clientId, id, text, photos)
      .catch((e: Error) => { toast.error(errorMessage(e, t)); throw e; });
  }, [clientId, mutations, toast, t]);

  const cancelEditNote = useCallback(() => {
    setEditingNoteId(null);
    setEditingNoteText('');
    setNotePhotos([]);
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
    setEditingNoteText('');
    setNotePhotos([]);
  }, []);

  const saveNewNote = useCallback((text: string, photos: string[]) => {
    setIsAddingNote(false);
    return mutations.createNote(clientId, text, photos)
      .catch((e: Error) => { toast.error(errorMessage(e, t)); throw e; });
  }, [clientId, mutations, toast, t]);

  const cancelAddNote = useCallback(() => {
    setIsAddingNote(false);
    setEditingNoteText('');
    setNotePhotos([]);
  }, []);

  const openWhatsApp = useCallback((phone: string) => {
    const digits = phone.replace(/\D/g, '');
    if (!digits) { toast.error(t('panel.toasts.noPhone')); return; }
    window.open(`https://wa.me/${digits}`, '_blank', 'noopener');
  }, [toast, t]);

  // Запись идёт мастером записи (журнал) — карточке остаётся подтянуть
  // свежие абонемент, визиты и ленту событий этого клиента.
  const refreshAfterBooking = useCallback(() => {
    // Префикс карточки: профиль и лента событий со всеми фильтрами разом.
    qc.invalidateQueries({ queryKey: queryKeys.client(clientId) });
  }, [qc, clientId]);

  const toggleBonus = useCallback(() => {
    setShowBonus(prev => !prev);
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
    editingNoteId, editingNoteText,
    startEditNote, saveNote, cancelEditNote,
    deletingNoteId, requestDeleteNote, cancelDeleteNote, confirmDeleteNote,
    isAddingNote, startAddNote, saveNewNote, cancelAddNote, notePhotos,
    refreshAfterBooking,
    showBonus, selectedBonus, toggleBonus, selectBonus,
    eventFilter, setEventFilter,
    copyToClipboard, openWhatsApp,
    remindAboutSubscription,
    updateField: (field: 'phone' | 'email' | 'instagram' | 'birth_date' | 'city', value: string | null) =>
      mutations.update(clientId, { [field]: value } as ClientUpdate).catch((e: Error) => toast.error(errorMessage(e, t))),
    updateRegistrationDate: (date: string) => mutations.updateRegistrationDate(clientId, date).catch((e: Error) => toast.error(errorMessage(e, t))),
  };
}
