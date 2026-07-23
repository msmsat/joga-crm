// src/components/modals/AddClientModal.tsx
import React, { useState, useMemo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import * as Icons from '../../../../../components/Icons'; // Убедитесь в правильности пути
import type { Booking, ClientListItem } from '../../types';
import { clientsApi } from '../../../../../api/clients/clients.api';
import { scheduleApi } from '../../../../../api/schedule';
import { formatIndexToTimeStr } from '../../utils';

interface AddClientModalProps {
  booking: Booking;
  onClose: () => void;
  onAdd: (clientIds: number[]) => void;
}

export const AddClientModal: React.FC<AddClientModalProps> = ({
  booking,
  onClose,
  onAdd
}) => {
  const { t } = useTranslation('journal');
  // Локальные стейты модалки
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedClients, setSelectedClients] = useState<number[]>([]);
  const [clients, setClients] = useState<ClientListItem[]>([]);

  // Уже записанные на это занятие — прячем из списка, чтобы повторная запись
  // не улетала на сервер и не возвращалась 409 «Клиент уже записан».
  const [bookedIds, setBookedIds] = useState<Set<number>>(new Set());

  // Реальные клиенты студии; поиск — локально по загруженному списку
  useEffect(() => {
    clientsApi.getList({ limit: 100 })
      .then(page => setClients(page.items))
      .catch(err => console.error('Не удалось загрузить клиентов', err));
    scheduleApi.getLesson(booking.id)
      .then(d => setBookedIds(new Set(d.booked_clients.map(c => c.client_id))))
      .catch(() => {}); // не загрузилось — просто не фильтруем, сервер подстрахует 409-м
  }, [booking.id]);

  // 🔥 Мемоизация поиска: пересчитывается только если изменился запрос
  const filteredClients = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return clients.filter(c =>
      !bookedIds.has(c.id) &&
      (`${c.name} ${c.last_name ?? ''}`.toLowerCase().includes(q) ||
        (c.phone ?? '').includes(searchQuery))
    );
  }, [clients, bookedIds, searchQuery]);

  // Закрытие по клавише Esc
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div className="modal-overlay open" onMouseDown={onClose}>
      <div className="modal-box" onMouseDown={e => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--onyx)' }}>{t('addClientModal.title')}</div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
              {booking.title} · {formatIndexToTimeStr(booking.timeStart)}
            </div>
          </div>
          <button type="button" className="btn-icon" onClick={onClose}><Icons.X /></button>
        </div>
        
        <div className="modal-body">
          {/* Поиск */}
          <div style={{ position: 'relative', marginBottom: 14 }}>
            <div style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }}>
              <Icons.Search />
            </div>
            <input
              className="modal-input"
              style={{ paddingLeft: 34, marginBottom: 0 }}
              placeholder={t('addClientModal.searchPlaceholder')}
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              autoFocus
            />
          </div>

          {/* Список клиентов */}
          <div style={{ maxHeight: 280, overflowY: 'auto' }}>
            {filteredClients.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 32 }}>
                <Icons.Icon.Profile size={48} color="var(--border)" className="empty-float" />
                <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 8 }}>{t('addClientModal.noClientsFound')}</div>
              </div>
            ) : (
              filteredClients.map(c => {
                const isSelected = selectedClients.includes(c.id);
                return (
                  <div
                    key={c.id}
                    className={`client-row ${isSelected ? 'selected' : ''}`}
                    onClick={() => setSelectedClients(prev =>
                      isSelected ? prev.filter(x => x !== c.id) : [...prev, c.id]
                    )}
                  >
                    <div className="client-ava">{[c.name, c.last_name].filter(Boolean).map(n => n![0]).join('')}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--onyx)' }}>{c.name} {c.last_name ?? ''}</div>
                      <div style={{ fontSize: 11, color: 'var(--muted)' }}>{c.phone ?? ''} · {c.visit_count} визитов</div>
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
        
        <div className="modal-footer" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>
            {selectedClients.length > 0
              ? t('addClientModal.selectedCount', { count: selectedClients.length })
              : t('addClientModal.chooseFromList')
            }
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn-ghost-sm" style={{ height: 38, padding: '0 20px', fontSize: 13 }} onClick={onClose}>
              {t('addClientModal.cancel')}
            </button>
            <button
              type="button"
              className="btn-primary-sm"
              style={{ height: 38, padding: '0 24px', fontSize: 13 }}
              onClick={() => onAdd(selectedClients)}
              disabled={selectedClients.length === 0}
            >
              <Icons.UserPlus />
              <span style={{ marginLeft: 6 }}>
                {t('addClientModal.add')} {selectedClients.length > 0 ? `(${selectedClients.length})` : ''}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};