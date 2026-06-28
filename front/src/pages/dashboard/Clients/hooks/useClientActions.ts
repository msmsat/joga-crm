import { useState, useCallback } from 'react';
import type { EventFilterTab } from '../types';
import { clientsApi } from '../../../../api/clients';

export interface NoteItem {
  id: number;
  text: string;
  date: string;
}

export function useClientActions(
  clientId: number,
  initialFrozen = false,
  initialTags: string[] = [],
  initialNotes: NoteItem[] = [],
) {
  const [toastMsg, setToastMsg]           = useState('');
  const [frozen, setFrozen]               = useState(initialFrozen);
  const [showTagPanel, setShowTagPanel]   = useState(false);
  const [localTags, setLocalTags]         = useState<string[]>(initialTags);
  const [notes, setNotes]                 = useState<NoteItem[]>(initialNotes);
  const [editingNoteId, setEditingNoteId] = useState<number | null>(null);
  const [editingNoteText, setEditingNoteText] = useState('');
  const [isAddingNote, setIsAddingNote]   = useState(false);
  const [newNoteText, setNewNoteText]     = useState('');
  const [showMessage, setShowMessage]     = useState(false);
  const [messageText, setMessageText]     = useState('');
  const [showBooking, setShowBooking]     = useState(false);
  const [showBonus, setShowBonus]         = useState(false);
  const [selectedBonus, setSelectedBonus] = useState<string | null>(null);
  const [eventFilter, setEventFilter]     = useState<EventFilterTab>('Все');
  const [bookingDate, setBookingDate]     = useState(0);
  const [bookingTime, setBookingTime]     = useState<string | null>(null);
  const [bookingService, setBookingService] = useState('');

  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 3000);
  }, []);

  const toggleFreeze = useCallback(() => {
    const next = !frozen;
    setFrozen(next);
    clientsApi.freeze(clientId, next).catch(() => setFrozen(!next));
  }, [frozen, clientId]);

  const toggleTagPanel = useCallback(() => {
    setShowTagPanel(prev => !prev);
  }, []);

  const addTag = useCallback((tag: string) => {
    const trimmed = tag.trim();
    if (!trimmed || localTags.includes(trimmed)) return;
    setLocalTags(prev => [...prev, trimmed]);
    clientsApi.addTag(clientId, trimmed)
      .then(res => setLocalTags(res.tags))
      .catch(() => setLocalTags(prev => prev.filter(t => t !== trimmed)));
  }, [localTags, clientId]);

  const removeTag = useCallback((tag: string) => {
    setLocalTags(prev => prev.filter(t => t !== tag));
    clientsApi.removeTag(clientId, tag)
      .then(res => setLocalTags(res.tags))
      .catch(() => setLocalTags(prev => [...prev, tag]));
  }, [clientId]);

  const startEditNote = useCallback((id: number, text: string) => {
    setEditingNoteId(id);
    setEditingNoteText(text);
    setIsAddingNote(false);
  }, []);

  const saveNote = useCallback((id: number) => {
    const text = editingNoteText;
    setNotes(prev => prev.map(n => n.id === id ? { ...n, text } : n));
    setEditingNoteId(null);
    clientsApi.updateNote(clientId, id, text);
  }, [editingNoteText, clientId]);

  const cancelEditNote = useCallback(() => {
    setEditingNoteId(null);
    setEditingNoteText('');
  }, []);

  const startAddNote = useCallback(() => {
    setIsAddingNote(true);
    setEditingNoteId(null);
    setNewNoteText('');
  }, []);

  const saveNewNote = useCallback(() => {
    const text = newNoteText.trim();
    if (!text) return;
    const tempId = Date.now();
    setNotes(prev => [...prev, { id: tempId, text, date: 'только что' }]);
    setIsAddingNote(false);
    setNewNoteText('');
    clientsApi.createNote(clientId, text)
      .then(res => setNotes(prev => prev.map(n => n.id === tempId ? { ...n, id: res.id } : n)));
  }, [newNoteText, clientId]);

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
    setMessageText('');
    showToast('Сообщение отправлено');
    void phone;
  }, [showToast]);

  const toggleBooking = useCallback(() => {
    setShowBooking(prev => !prev);
    setShowMessage(false);
    setShowBonus(false);
  }, []);

  const confirmBooking = useCallback(() => {
    setShowBooking(false);
    showToast('Запись создана');
  }, [showToast]);

  const toggleBonus = useCallback(() => {
    setShowBonus(prev => !prev);
    setShowMessage(false);
    setShowBooking(false);
    setSelectedBonus(null);
  }, []);

  const selectBonus = useCallback((id: string, label: string) => {
    setSelectedBonus(id);
    setTimeout(() => {
      setShowBonus(false);
      setSelectedBonus(null);
      showToast(`Бонус начислен: ${label}`);
    }, 600);
  }, [showToast]);

  const copyToClipboard = useCallback((value: string) => {
    navigator.clipboard.writeText(value).then(() => showToast('Успешно скопировано'));
  }, [showToast]);

  const handleCall = useCallback((phone: string) => {
    showToast(`Вызов на номер ${phone}`);
  }, [showToast]);

  return {
    toastMsg,
    frozen, toggleFreeze,
    showTagPanel, toggleTagPanel, localTags, addTag, removeTag,
    notes, editingNoteId, editingNoteText, setEditingNoteText,
    startEditNote, saveNote, cancelEditNote,
    isAddingNote, newNoteText, setNewNoteText, startAddNote, saveNewNote, cancelAddNote,
    showMessage, messageText, setMessageText, toggleMessage, sendMessage,
    showBooking, toggleBooking, confirmBooking,
    bookingDate, setBookingDate, bookingTime, setBookingTime,
    bookingService, setBookingService,
    showBonus, selectedBonus, toggleBonus, selectBonus,
    eventFilter, setEventFilter,
    copyToClipboard, handleCall,
  };
}
