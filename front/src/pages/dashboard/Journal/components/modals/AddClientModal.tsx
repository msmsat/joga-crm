// src/components/modals/AddClientModal.tsx
import React, { useState, useMemo, useEffect } from 'react';
import * as Icons from '../../../../../components/Icons'; // Убедитесь в правильности пути
import type { Booking } from '../../types';
import { CLIENTS_DB, TIMES } from '../../constants';

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
  // Локальные стейты модалки
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedClients, setSelectedClients] = useState<number[]>([]);

  // 🔥 Мемоизация поиска: пересчитывается только если изменился запрос
  const filteredClients = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return CLIENTS_DB.filter(c =>
      c.name.toLowerCase().includes(q) ||
      (c.phone ?? '').includes(searchQuery)
    );
  }, [searchQuery]);

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
            <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--onyx)' }}>Добавить клиента</div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
              {booking.title} · {TIMES[booking.timeStart] || '00:00'}
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
              placeholder="Поиск по имени или телефону..."
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
                <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 8 }}>Клиенты не найдены</div>
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
              ? `Выбрано: ${selectedClients.length} клиент(а)`
              : 'Выберите клиентов из списка'
            }
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn-ghost-sm" style={{ height: 38, padding: '0 20px', fontSize: 13 }} onClick={onClose}>
              Отмена
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
                Добавить {selectedClients.length > 0 ? `(${selectedClients.length})` : ''}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};