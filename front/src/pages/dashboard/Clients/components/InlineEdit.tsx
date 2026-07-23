import { useState } from 'react';
import type { ReactNode } from 'react';

const IconPencil = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>
  </svg>
);

/**
 * Инлайн-редактирование значения по паттерну даты регистрации в шапке панели:
 * карандаш (или клик по значению, если оно не ссылка) → инпут →
 * blur/Enter — сохранить, Esc — отмена. Живёт внутри flex-строки контакта.
 */
export function InlineEdit({ value, type = 'text', title, clickToEdit = false, onSave, children }: {
  value: string;
  type?: 'text' | 'date' | 'email' | 'tel';
  title?: string;
  clickToEdit?: boolean;
  onSave: (value: string) => void;
  children: ReactNode;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  const start = () => { setDraft(value); setEditing(true); };
  const commit = () => {
    setEditing(false);
    const next = draft.trim();
    if (next !== value.trim()) onSave(next);
  };

  if (editing) {
    return (
      <input
        autoFocus
        type={type}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') setEditing(false);
        }}
        style={{ flex: 1, minWidth: 0, padding: '5px 8px', borderRadius: '7px', border: '1px solid var(--peach)', boxShadow: '0 0 0 3px rgba(249,160,139,0.12)', outline: 'none', fontSize: '12px', fontWeight: 600, fontFamily: 'Manrope', color: 'var(--text)', background: '#fff', boxSizing: 'border-box' }}
      />
    );
  }

  return (
    <>
      {clickToEdit ? (
        <div onClick={start} title={title} style={{ flex: 1, minWidth: 0, cursor: 'pointer' }}>{children}</div>
      ) : children}
      <button
        className="cl-copy-btn"
        onClick={start}
        title={title}
        style={{ width: '26px', height: '26px', borderRadius: '7px', border: 'none', background: 'transparent', color: 'var(--text3)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all 0.15s' }}
      >
        <IconPencil/>
      </button>
    </>
  );
}
