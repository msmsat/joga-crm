import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Tooltip, ConfirmModal, useToast } from '../../../../../../components/ui/index';
import { errorMessage } from '../../../../../../api/errorMessage';
import { getInitials, getAvatarColor } from '../../../../Clients/utils/mapClient';
import type { Task } from '../../../types';
import { PRIORITY_COLOR, TAG_COLORS, TAG_TEXT } from '../../../constants';
import styles from '../../../Overview.module.css';

interface TaskRowProps {
  task: Task;
  done: boolean;
  showAssignee: boolean;
  onToggle: (id: number) => void;
  onDelete: (id: number) => Promise<void>;
  isNew?: boolean;
}

export default function TaskRow({ task, done, showAssignee, onToggle, onDelete, isNew }: TaskRowProps) {
  const { t } = useTranslation('dashboard');
  const toast = useToast();
  const [hovered, setHovered] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const [firstName, ...rest] = (task.assignee_name ?? '').split(' ');

  return (
    <div
      className={done
        ? undefined
        : [styles.taskRow, isNew ? styles.taskEntryAnimate : ''].filter(Boolean).join(' ')
      }
      onClick={() => onToggle(task.id)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '9px 8px', borderRadius: 10,
        cursor: 'pointer', marginBottom: 3,
        opacity: done ? 0.45 : 1,
        ...(done ? { transition: 'background 0.15s' } : {}),
      }}
      onMouseOver={done ? (e => { e.currentTarget.style.background = 'var(--bg2)'; }) : undefined}
      onMouseOut={done ? (e => { e.currentTarget.style.background = 'transparent'; }) : undefined}
    >
      {/* Checkbox */}
      <div style={{
        width: 18, height: 18, borderRadius: 5, flexShrink: 0,
        border: done ? 'none' : '1.5px solid var(--border)',
        background: done ? 'var(--peach)' : 'transparent',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'all 0.2s',
      }}>
        {done && (
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        )}
      </div>

      {/* Text */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 13, fontWeight: 600, color: 'var(--onyx)',
          textDecoration: done ? 'line-through' : 'none',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {task.text}
        </div>
      </div>

      {/* Assignee avatar — только вне «Моих», иначе он был бы одинаков во всех строках */}
      {showAssignee && task.assignee_name && (
        <Tooltip label={task.assignee_name} side="top">
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 9, fontWeight: 800, color: 'rgba(255,255,255,0.95)',
              background: `linear-gradient(135deg, ${getAvatarColor(task.assignee_id ?? 0)}, ${getAvatarColor(task.assignee_id ?? 0)}cc)`,
              boxShadow: `0 2px 6px -2px ${getAvatarColor(task.assignee_id ?? 0)}80`,
            }}
          >
            {getInitials(firstName ?? '', rest.join(' '))}
          </div>
        </Tooltip>
      )}

      {/* Tag */}
      {task.tag && (
        <div style={{
          fontSize: 10, fontWeight: 700, color: TAG_TEXT[task.tag] ?? 'var(--muted)',
          background: TAG_COLORS[task.tag] ?? 'var(--bg2)',
          padding: '2px 8px', borderRadius: 5, flexShrink: 0,
        }}>
          {t(`tasks.tags.${task.tag}`, { defaultValue: task.tag })}
        </div>
      )}

      {/* Priority dot */}
      <div
        title={t(`tasks.priorityHint.${task.priority}`)}
        style={{
          width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
          background: PRIORITY_COLOR[task.priority],
        }}
      />

      {/* Delete — по наведению */}
      <button
        onClick={e => { e.stopPropagation(); setConfirmOpen(true); }}
        style={{
          width: 22, height: 22, flexShrink: 0, border: 'none', background: 'transparent',
          borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--muted)', opacity: hovered ? 1 : 0,
          pointerEvents: hovered ? 'auto' : 'none',
          transition: 'opacity 0.15s, background 0.15s, color 0.15s',
        }}
        onMouseOver={e => { e.currentTarget.style.background = 'rgba(216,140,154,0.12)'; e.currentTarget.style.color = '#D88C9A'; }}
        onMouseOut={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--muted)'; }}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
        </svg>
      </button>

      {confirmOpen && (
        <ConfirmModal
          title={t('tasks.deleteTitle')}
          message={t('tasks.deleteMessage')}
          danger
          onConfirm={() => onDelete(task.id).catch(e => {
            toast.error(errorMessage(e, t));
            throw e; // ConfirmModal ловит это и оставляет модалку открытой
          })}
          onClose={() => setConfirmOpen(false)}
        />
      )}
    </div>
  );
}
