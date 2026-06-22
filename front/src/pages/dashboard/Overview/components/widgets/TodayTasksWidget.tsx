import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { Task } from '../../types';
import styles from '../../Overview.module.css';

const PRIORITY_COLOR: Record<Task['priority'], string> = {
  high:   '#D88C9A',
  medium: '#FCAE91',
  low:    'var(--muted)',
};

const PRIORITY_DOT_TITLE: Record<Task['priority'], string> = {
  high:   'Высокий приоритет',
  medium: 'Средний приоритет',
  low:    'Низкий приоритет',
};

const TAG_COLORS: Record<string, string> = {
  Клиент:   'rgba(91,171,114,0.12)',
  Финансы:  'rgba(252,174,145,0.12)',
  Лиды:     'rgba(74,128,196,0.12)',
  Отчёты:   'rgba(216,140,154,0.12)',
  Журнал:   'rgba(64,168,160,0.12)',
  Персонал: 'rgba(123,108,212,0.12)',
};

const TAG_TEXT: Record<string, string> = {
  Клиент:   '#5BAB72',
  Финансы:  '#e09070',
  Лиды:     '#4A80C4',
  Отчёты:   '#D88C9A',
  Журнал:   '#40a8a0',
  Персонал: '#7B6CD4',
};

const TAG_OPTIONS = Object.keys(TAG_COLORS).map(tag => ({ value: tag, label: tag }));
const PRIORITY_OPTIONS: { value: Task['priority']; label: string }[] = [
  { value: 'low',    label: 'Низкий' },
  { value: 'medium', label: 'Средний' },
  { value: 'high',   label: 'Высокий' },
];

interface Props {
  tasks: Task[];
}

export default function TodayTasksWidget({ tasks: initialTasks }: Props) {
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [doneIds, setDoneIds] = useState<Set<number>>(new Set());
  const [showDone, setShowDone] = useState(false);
  const [newlyAddedId, setNewlyAddedId] = useState<number | null>(null);

  const [isAddingTask, setIsAddingTask] = useState(false);
  const [newTaskText, setNewTaskText] = useState('');
  const [newTaskTag, setNewTaskTag] = useState('Клиент');
  const [newTaskPriority, setNewTaskPriority] = useState<Task['priority']>('medium');

  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isAddingTask && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [isAddingTask]);

  const toggle = (id: number) =>
    setDoneIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const addTask = () => {
    const text = newTaskText.trim();
    if (!text) return;
    const newTask: Task = {
      id: Date.now(),
      text,
      priority: newTaskPriority,
      tag: newTaskTag,
    };
    setTasks(prev => [newTask, ...prev]);
    setNewlyAddedId(newTask.id);
    setTimeout(() => setNewlyAddedId(null), 600);
    setIsAddingTask(false);
    setNewTaskText('');
  };

  const pending = tasks.filter(t => !doneIds.has(t.id));
  const done    = tasks.filter(t => doneIds.has(t.id));

  return (
    <div
      className="card"
      style={{
        padding: 0,
        display: 'flex',
        flexDirection: 'column',
        height: '400px',
        overflow: 'hidden',
        border: '1px solid var(--border2)',
        boxShadow: 'var(--dash-shadow-lg)',
      }}
    >
      {/* Header */}
      <div style={{
        padding: '20px 24px 16px',
        borderBottom: '1px solid var(--border2)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexShrink: 0,
      }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--onyx)', letterSpacing: '-0.3px' }}>
            Задачи на сегодня
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2, fontWeight: 500 }}>
            {pending.length} задач осталось
          </div>
        </div>
        {pending.length > 0 && (
          <div style={{
            width: 28, height: 28,
            borderRadius: '50%',
            background: 'linear-gradient(135deg, var(--peach-light), var(--peach))',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 12, fontWeight: 800, color: '#fff',
            boxShadow: '0 4px 10px var(--peach-glow)',
          }}>
            {pending.length}
          </div>
        )}
      </div>

      {/* Task list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
        {pending.map(task => (
          <TaskRow
            key={task.id}
            task={task}
            done={false}
            onToggle={toggle}
            isNew={task.id === newlyAddedId}
          />
        ))}

        {done.length > 0 && (
          <>
            <button
              onClick={() => setShowDone(v => !v)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                background: 'none', border: 'none', cursor: 'pointer',
                fontSize: 11, fontWeight: 700, color: 'var(--muted)',
                textTransform: 'uppercase', letterSpacing: '0.6px',
                padding: '8px 4px 4px', width: '100%',
              }}
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                style={{ transform: showDone ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>
                <polyline points="9 18 15 12 9 6" />
              </svg>
              Выполнено · {done.length}
            </button>
            {showDone && done.map(task => (
              <TaskRow key={task.id} task={task} done onToggle={toggle} />
            ))}
          </>
        )}
      </div>

      {/* Footer */}
      <div style={{
        borderTop: '1px solid var(--border2)',
        flexShrink: 0,
        background: isAddingTask ? 'rgba(26,26,26,0.02)' : 'transparent',
        transition: 'background 0.3s ease',
      }}>

        {/* Add task form (slides in) */}
        <div style={{
          overflow: 'hidden',
          maxHeight: isAddingTask ? '200px' : '0px',
          opacity: isAddingTask ? 1 : 0,
          transition: 'all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
          padding: isAddingTask ? '16px' : '0 16px',
          boxSizing: 'border-box',
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <input
              ref={inputRef}
              placeholder="Название задачи..."
              value={newTaskText}
              onChange={e => setNewTaskText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addTask(); }}
              style={{
                width: '100%', padding: '10px 14px', borderRadius: '10px',
                border: '1px solid var(--border)', outline: 'none',
                fontSize: '13px', fontWeight: 500, fontFamily: 'var(--font-main)',
                background: '#fff', color: 'var(--onyx)', transition: 'all 0.2s',
                boxShadow: '0 2px 8px rgba(0,0,0,0.02)', boxSizing: 'border-box',
              }}
              onFocus={e => { e.currentTarget.style.borderColor = 'var(--peach)'; e.currentTarget.style.boxShadow = '0 0 0 3px var(--peach-glow)'; }}
              onBlur={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.02)'; }}
            />
            <div style={{ display: 'flex', gap: '8px' }}>
              <InlineSelect
                value={newTaskTag}
                options={TAG_OPTIONS}
                onChange={v => setNewTaskTag(v)}
              />
              <InlineSelect
                value={newTaskPriority}
                options={PRIORITY_OPTIONS}
                onChange={v => setNewTaskPriority(v)}
              />
            </div>
            <div style={{ display: 'flex', gap: '8px', marginTop: '2px' }}>
              <button
                onClick={() => setIsAddingTask(false)}
                style={{
                  flex: 1, padding: '10px', borderRadius: '10px', border: '1px solid var(--border)',
                  background: '#fff', color: 'var(--text3)', fontSize: '13px', fontWeight: 700,
                  cursor: 'pointer', transition: 'all 0.2s', fontFamily: 'var(--font-main)',
                }}
                onMouseOver={e => { e.currentTarget.style.background = 'var(--bg)'; e.currentTarget.style.color = 'var(--text2)'; }}
                onMouseOut={e => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.color = 'var(--text3)'; }}
              >
                Отмена
              </button>
              <button
                onClick={addTask}
                disabled={!newTaskText.trim()}
                style={{
                  flex: 1, padding: '10px', borderRadius: '10px', border: 'none',
                  background: newTaskText.trim()
                    ? 'linear-gradient(135deg, var(--peach-light), var(--peach))'
                    : 'rgba(26,26,26,0.04)',
                  color: newTaskText.trim() ? '#FFFFFF' : 'var(--muted)',
                  boxShadow: newTaskText.trim() ? '0 4px 12px var(--peach-glow)' : 'none',
                  fontSize: '13px', fontWeight: 700,
                  cursor: newTaskText.trim() ? 'pointer' : 'not-allowed',
                  transition: 'all 0.2s', fontFamily: 'var(--font-main)',
                }}
                onMouseOver={e => {
                  if (newTaskText.trim()) {
                    e.currentTarget.style.background = 'linear-gradient(135deg, #F9A08B, #F5866E)';
                    e.currentTarget.style.transform = 'translateY(-1px)';
                    e.currentTarget.style.boxShadow = '0 6px 16px rgba(249,160,139,0.35)';
                  }
                }}
                onMouseOut={e => {
                  if (newTaskText.trim()) {
                    e.currentTarget.style.background = 'linear-gradient(135deg, var(--peach-light), var(--peach))';
                    e.currentTarget.style.transform = 'none';
                    e.currentTarget.style.boxShadow = '0 4px 12px var(--peach-glow)';
                  }
                }}
              >
                Добавить
              </button>
            </div>
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
            Добавить задачу
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── INLINE SELECT ────────────────────────────────────────────────────────────
interface SelectOption<T extends string> {
  value: T;
  label: string;
}

interface InlineSelectProps<T extends string> {
  value: T;
  options: SelectOption<T>[];
  onChange: (v: T) => void;
}

function InlineSelect<T extends string>({ value, options, onChange }: InlineSelectProps<T>) {
  const [open, setOpen] = useState(false);
  const [dropPos, setDropPos] = useState<{ bottom: number; left: number; width: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const current = options.find(o => o.value === value);

  const handleToggle = () => {
    if (open) { setOpen(false); return; }
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setDropPos({ bottom: window.innerHeight - rect.top + 4, left: rect.left, width: rect.width });
    }
    setOpen(true);
  };

  return (
    <div style={{ position: 'relative', flex: 1 }}>
      <button
        ref={triggerRef}
        type="button"
        onClick={handleToggle}
        style={{
          width: '100%', padding: '10px 12px', borderRadius: '10px',
          border: open ? '1px solid var(--peach)' : '1px solid var(--border)',
          outline: 'none', fontSize: '13px', fontWeight: 600,
          fontFamily: 'var(--font-main)', background: '#fff',
          color: 'var(--onyx)', cursor: 'pointer', boxSizing: 'border-box',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px',
          transition: 'border-color 0.2s',
        }}
      >
        <span>{current?.label ?? value}</span>
        <svg
          width="11" height="11" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
          style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', flexShrink: 0 }}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && dropPos && createPortal(
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 9998 }} onClick={() => setOpen(false)} />
          <div
            className={styles.inlineSelectDrop}
            style={{ position: 'fixed', bottom: dropPos.bottom, left: dropPos.left, width: dropPos.width, zIndex: 9999 }}
          >
            {options.map(opt => (
              <div
                key={opt.value}
                className={`${styles.inlineSelectItem} ${opt.value === value ? styles.inlineSelectItemActive : ''}`}
                onClick={() => { onChange(opt.value); setOpen(false); }}
              >
                <span className={styles.inlineSelectCheck}>
                  {opt.value === value && (
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </span>
                {opt.label}
              </div>
            ))}
          </div>
        </>,
        document.body
      )}
    </div>
  );
}

// ─── TASK ROW ─────────────────────────────────────────────────────────────────
interface RowProps {
  task: Task;
  done: boolean;
  onToggle: (id: number) => void;
  isNew?: boolean;
}

function TaskRow({ task, done, onToggle, isNew }: RowProps) {
  return (
    <div
      className={done
        ? undefined
        : [styles.taskRow, isNew ? styles.taskEntryAnimate : ''].filter(Boolean).join(' ')
      }
      onClick={() => onToggle(task.id)}
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

      {/* Tag */}
      <div style={{
        fontSize: 10, fontWeight: 700, color: TAG_TEXT[task.tag] ?? 'var(--muted)',
        background: TAG_COLORS[task.tag] ?? 'var(--bg2)',
        padding: '2px 8px', borderRadius: 5, flexShrink: 0,
      }}>
        {task.tag}
      </div>

      {/* Priority dot */}
      <div
        title={PRIORITY_DOT_TITLE[task.priority]}
        style={{
          width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
          background: PRIORITY_COLOR[task.priority],
        }}
      />
    </div>
  );
}
