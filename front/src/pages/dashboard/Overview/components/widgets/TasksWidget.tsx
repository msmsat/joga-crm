import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useOverviewTasks } from '../../hooks/useOverviewTasks';
import { ApiError } from '../../../../../api';
import { errorMessage } from '../../../../../api/errorMessage';
import { useToast } from '../../../../../components/ui/index';
import styles from '../../Overview.module.css';
import TasksHeader from './tasks/TasksHeader';
import TaskRow from './tasks/TaskRow';
import AddTaskForm from './tasks/AddTaskForm';

const ListSkeleton = () => (
  <>
    {[0, 1, 2].map(i => (
      <div key={i} className={styles.skel} style={{ height: '36px', marginBottom: '6px' }} />
    ))}
  </>
);

export default function TasksWidget() {
  const { t } = useTranslation('dashboard');
  const toast = useToast();
  const {
    tasks, toggle, create, remove, error, isFirstLoad,
    role, scope, setScope, assigneeId, setAssigneeId, assignees,
  } = useOverviewTasks();
  const [showDone, setShowDone] = useState(false);
  const [newlyAddedId, setNewlyAddedId] = useState<number | null>(null);

  // Роль сменилась в другой вкладке, токен ещё старый — не роняем страницу.
  const forbidden = error instanceof ApiError && error.status === 403;
  const showAssignee = scope !== 'mine';

  const handleToggle = (id: number) => {
    const target = tasks.find(t => t.id === id);
    if (!target) return;
    // Оптимистичный откат — внутри мутации; тост сообщает пользователю о неудаче.
    toggle(id, !target.is_done).catch(e => toast.error(errorMessage(e, t)));
  };

  const handleCreated = (id: number) => {
    setNewlyAddedId(id);
    setTimeout(() => setNewlyAddedId(null), 600);
  };

  const pending = tasks.filter(t => !t.is_done);
  const done    = tasks.filter(t => t.is_done);

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
      <TasksHeader
        pendingCount={pending.length}
        role={role}
        scope={scope}
        setScope={setScope}
        assigneeId={assigneeId}
        setAssigneeId={setAssigneeId}
        assignees={assignees}
      />

      {forbidden ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>
          {t('state.ownerOnly')}
        </div>
      ) : (
        <>
          {/* Task list */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
            {isFirstLoad ? (
              <ListSkeleton />
            ) : tasks.length === 0 ? (
              <div style={{ padding: '32px 8px', textAlign: 'center', color: 'var(--muted)', fontSize: 13, fontWeight: 500 }}>
                {t('tasks.empty')}
              </div>
            ) : (
              <>
                {pending.map(task => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    done={false}
                    showAssignee={showAssignee}
                    onToggle={handleToggle}
                    onDelete={remove}
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
                      {t('tasks.done')} · {done.length}
                    </button>
                    {showDone && done.map(task => (
                      <TaskRow key={task.id} task={task} done showAssignee={showAssignee} onToggle={handleToggle} onDelete={remove} />
                    ))}
                  </>
                )}
              </>
            )}
          </div>

          <AddTaskForm scope={scope} assigneeId={assigneeId} onCreate={create} onCreated={handleCreated} />
        </>
      )}
    </div>
  );
}
