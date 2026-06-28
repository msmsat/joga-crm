import { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { RecentEvent } from '../../types';

function toRelative(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (diff < 1)   return 'только что';
  if (diff < 60)  return `${diff} мин. назад`;
  const h = Math.floor(diff / 60);
  if (h < 24)    return `${h} ч назад`;
  return `${Math.floor(h / 24)} дн. назад`;
}

interface Props {
  event: RecentEvent;
}

export default function EventCard({ event }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{ bottom: number; right: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  const toggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isOpen) { setIsOpen(false); return; }
    if (btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      setMenuPos({ bottom: window.innerHeight - rect.top + 8, right: window.innerWidth - rect.right });
    }
    setIsOpen(true);
  };

  return (
    <div
      className="activity-item"
      style={{
        margin: 0,
        background: '#FFFFFF',
        padding: '14px 16px',
        borderRadius: '12px',
        border: '1px solid rgba(26,26,26,0.05)',
        boxShadow: '0 2px 8px rgba(26,26,26,0.04)',
        transition: 'box-shadow 0.2s ease, transform 0.2s ease',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.boxShadow = '0 4px 16px rgba(26,26,26,0.08)';
        e.currentTarget.style.transform = 'translateY(-1px)';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.boxShadow = '0 2px 8px rgba(26,26,26,0.04)';
        e.currentTarget.style.transform = 'none';
      }}
    >
      <div className="activity-dot" style={{ background: event.color }} />
      <div style={{ flex: 1 }}>
        <div className="activity-text" style={{ fontSize: '12px' }}>
          <strong>{event.actor_name}</strong> {event.title}
        </div>
        <div className="activity-time">{toRelative(event.created_at)}</div>
      </div>

      <div style={{ position: 'relative' }}>
        <button
          ref={btnRef}
          className={`activity-action-btn ${isOpen ? 'is-open' : ''}`}
          onClick={toggle}
          style={{ background: '#fff' }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <circle cx="12" cy="12" r="1" /><circle cx="12" cy="5" r="1" /><circle cx="12" cy="19" r="1" />
          </svg>
        </button>
      </div>

      {isOpen && menuPos && createPortal(
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 9998 }} onClick={() => setIsOpen(false)} />
          <div
            className="activity-dropdown"
            style={{ position: 'fixed', bottom: menuPos.bottom, right: menuPos.right, top: 'auto', zIndex: 9999 }}
            onMouseDown={e => e.stopPropagation()}
          >
            <div className="dropdown-item">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
              </svg>
              Открыть профиль
            </div>
            {event.event_type === 'booking' && (
              <div className="dropdown-item">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>
                </svg>
                Написать в WhatsApp
              </div>
            )}
            {event.event_type === 'payment' && (
              <div className="dropdown-item">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="15" y2="17"/>
                </svg>
                Отправить чек
              </div>
            )}
            {(event.event_type === 'booking' || event.event_type === 'cancel') && (
              <div className="dropdown-item danger">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
                </svg>
                Отменить запись
              </div>
            )}
          </div>
        </>,
        document.body
      )}
    </div>
  );
}
