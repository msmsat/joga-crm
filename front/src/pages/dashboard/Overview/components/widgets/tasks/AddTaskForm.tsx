import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Select, useToast } from '../../../../../../components/ui/index';
import { errorMessage } from '../../../../../../api/errorMessage';
import { TAG_COLORS } from '../../../constants';
import type { Task } from '../../../types';
import type { StudioTask, StudioTaskCreate, TaskScope } from '../../../../../../api/analytics';

interface AddTaskFormProps {
  scope: TaskScope;
  assigneeId: number | null;
  onCreate: (payload: StudioTaskCreate) => Promise<StudioTask>;
  onCreated: (id: number) => void;
}

export default function AddTaskForm({ scope, assigneeId, onCreate, onCreated }: AddTaskFormProps) {
  const { t } = useTranslation('dashboard');
  const toast = useToast();
  const [isAddingTask, setIsAddingTask] = useState(false);
  const [newTaskText, setNewTaskText] = useState('');
  const [newTaskTag, setNewTaskTag] = useState('Клиент');
  const [newTaskPriority, setNewTaskPriority] = useState<Task['priority']>('medium');

  const inputRef = useRef<HTMLInputElement>(null);

  const tagOptions = Object.keys(TAG_COLORS).map(tag => ({ value: tag, label: t(`tasks.tags.${tag}`, { defaultValue: tag }) }));
  const priorityOptions: { value: Task['priority']; label: string }[] = [
    { value: 'low',    label: t('tasks.priority.low') },
    { value: 'medium', label: t('tasks.priority.medium') },
    { value: 'high',   label: t('tasks.priority.high') },
  ];

  useEffect(() => {
    if (isAddingTask && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [isAddingTask]);

  // Чужой срез без выбранного сотрудника: молча создать задачу себе нельзя —
  // она «исчезнет» из текущего списка и это выглядит как баг.
  const needsAssignee = scope !== 'mine' && assigneeId == null;
  const canSubmit = newTaskText.trim().length > 0 && !needsAssignee;

  const submit = async () => {
    const text = newTaskText.trim();
    if (!text || needsAssignee) return;
    try {
      const created = await onCreate({
        text,
        priority: newTaskPriority,
        tag: newTaskTag,
        ...(assigneeId != null ? { assignee_id: assigneeId } : {}),
      });
      setIsAddingTask(false);
      setNewTaskText('');
      onCreated(created.id);
    } catch (e) {
      toast.error(errorMessage(e, t)); // форма остаётся заполненной — можно повторить
    }
  };

  return (
    <div style={{
      borderTop: '1px solid var(--border2)',
      flexShrink: 0,
      background: isAddingTask ? 'rgba(var(--ink),0.02)' : 'transparent',
      transition: 'background 0.3s ease',
    }}>

      {/* Add task form (slides in) */}
      <div style={{
        overflow: 'hidden',
        maxHeight: isAddingTask ? (needsAssignee ? '230px' : '200px') : '0px',
        opacity: isAddingTask ? 1 : 0,
        transition: 'all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
        padding: isAddingTask ? '16px' : '0 16px',
        boxSizing: 'border-box',
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <input
            ref={inputRef}
            placeholder={t('tasks.namePlaceholder')}
            value={newTaskText}
            onChange={e => setNewTaskText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') submit(); }}
            style={{
              width: '100%', padding: '10px 14px', borderRadius: '10px',
              border: '1px solid var(--border)', outline: 'none',
              fontSize: '13px', fontWeight: 500, fontFamily: 'var(--font-main)',
              background: 'var(--bg-card)', color: 'var(--onyx)', transition: 'all 0.2s',
              boxShadow: '0 2px 8px rgba(0,0,0,0.02)', boxSizing: 'border-box',
            }}
            onFocus={e => { e.currentTarget.style.borderColor = 'var(--peach)'; e.currentTarget.style.boxShadow = '0 0 0 3px var(--peach-glow)'; }}
            onBlur={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.02)'; }}
          />
          <div style={{ display: 'flex', gap: '8px' }}>
            <Select value={newTaskTag} options={tagOptions} onChange={setNewTaskTag} openUp />
            <Select
              value={newTaskPriority}
              options={priorityOptions}
              onChange={v => setNewTaskPriority(v as Task['priority'])}
              openUp
            />
          </div>
          <div style={{ display: 'flex', gap: '8px', marginTop: '2px' }}>
            <button
              onClick={() => setIsAddingTask(false)}
              style={{
                flex: 1, padding: '10px', borderRadius: '10px', border: '1px solid var(--border)',
                background: 'var(--bg-card)', color: 'var(--text3)', fontSize: '13px', fontWeight: 700,
                cursor: 'pointer', transition: 'all 0.2s', fontFamily: 'var(--font-main)',
              }}
              onMouseOver={e => { e.currentTarget.style.background = 'var(--bg)'; e.currentTarget.style.color = 'var(--text2)'; }}
              onMouseOut={e => { e.currentTarget.style.background = 'var(--bg-card)'; e.currentTarget.style.color = 'var(--text3)'; }}
            >
              {t('tasks.cancel')}
            </button>
            <button
              onClick={submit}
              disabled={!canSubmit}
              style={{
                flex: 1, padding: '10px', borderRadius: '10px', border: 'none',
                background: canSubmit
                  ? 'linear-gradient(135deg, var(--peach-light), var(--peach))'
                  : 'rgba(var(--ink),0.04)',
                color: canSubmit ? '#FFFFFF' : 'var(--muted)',
                boxShadow: canSubmit ? '0 4px 12px var(--peach-glow)' : 'none',
                fontSize: '13px', fontWeight: 700,
                cursor: canSubmit ? 'pointer' : 'not-allowed',
                transition: 'all 0.2s', fontFamily: 'var(--font-main)',
              }}
              onMouseOver={e => {
                if (canSubmit) {
                  e.currentTarget.style.background = 'linear-gradient(135deg, #F9A08B, #F5866E)';
                  e.currentTarget.style.transform = 'translateY(-1px)';
                  e.currentTarget.style.boxShadow = '0 6px 16px rgba(249,160,139,0.35)';
                }
              }}
              onMouseOut={e => {
                if (canSubmit) {
                  e.currentTarget.style.background = 'linear-gradient(135deg, var(--peach-light), var(--peach))';
                  e.currentTarget.style.transform = 'none';
                  e.currentTarget.style.boxShadow = '0 4px 12px var(--peach-glow)';
                }
              }}
            >
              {t('tasks.submit')}
            </button>
          </div>
          {needsAssignee && (
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textAlign: 'center' }}>
              {t('tasks.assigneePlaceholder')}
            </div>
          )}
        </div>
      </div>

      {/* Add task button (default state) */}
      <div style={{
        overflow: 'hidden',
        maxHeight: isAddingTask ? '0px' : '80px',
        opacity: isAddingTask ? 0 : 1,
        transition: 'all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
        padding: isAddingTask ? '0 16px' : '12px 16px',
        boxSizing: 'border-box',
      }}>
        <button
          onClick={() => setIsAddingTask(true)}
          style={{
            width: '100%', height: 38,
            background: 'transparent',
            border: '1.5px dashed var(--border)',
            borderRadius: 10,
            fontSize: 13, fontWeight: 700, color: 'var(--text3)',
            cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            transition: 'all 0.2s ease', fontFamily: 'var(--font-main)',
          }}
          onMouseOver={e => {
            e.currentTarget.style.borderColor = 'var(--peach)';
            e.currentTarget.style.color = 'var(--peach)';
            e.currentTarget.style.background = 'rgba(249,160,139,0.05)';
          }}
          onMouseOut={e => {
            e.currentTarget.style.borderColor = 'var(--border)';
            e.currentTarget.style.color = 'var(--text3)';
            e.currentTarget.style.background = 'transparent';
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          {t('tasks.add')}
        </button>
      </div>
    </div>
  );
}
