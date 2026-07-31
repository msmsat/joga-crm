import { useTranslation } from 'react-i18next';
import { Select } from '../../../../../../components/ui/index';
import type { AssigneeOption, StudioRole, TaskScope } from '../../../../../../api/analytics';

// Инвариант UI ↔ API: это фильтр удобства, не защита. Право доступа проверяет
// бэк (D2) — подставленный руками scope=admins от тренера вернёт 403.
const SCOPE_OPTIONS: Record<StudioRole, TaskScope[]> = {
  owner:   ['mine', 'admins', 'trainers'],
  admin:   ['mine', 'trainers'],
  trainer: ['mine'],
};

interface TasksHeaderProps {
  pendingCount: number;
  role: StudioRole;
  scope: TaskScope;
  setScope: (scope: TaskScope) => void;
  assigneeId: number | null;
  setAssigneeId: (id: number | null) => void;
  assignees: AssigneeOption[];
}

export default function TasksHeader({
  pendingCount, role, scope, setScope, assigneeId, setAssigneeId, assignees,
}: TasksHeaderProps) {
  const { t } = useTranslation('dashboard');

  const scopeOptions = SCOPE_OPTIONS[role].map(v => ({ value: v, label: t(`tasks.scope.${v}`) }));
  const wantedRole = scope === 'admins' ? 'admin' : 'trainer';
  const people = scope !== 'mine' ? assignees.filter(a => a.role === wantedRole) : [];

  // Бейдж уже показывает число — подзаголовок не дублирует его, а описывает срез.
  const selectedPerson = assigneeId != null ? assignees.find(a => a.user_id === assigneeId) : null;
  const subtitle = selectedPerson?.name ?? t(`tasks.scope.${scope}`);

  return (
    <div style={{
      padding: '20px 24px 16px',
      borderBottom: '1px solid var(--border2)',
      display: 'flex',
      flexWrap: 'wrap',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      flexShrink: 0,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--onyx)', letterSpacing: '-0.3px' }}>
            {t('tasks.title')}
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2, fontWeight: 500 }}>
            {subtitle}
          </div>
        </div>
        {pendingCount > 0 && (
          <div style={{
            width: 28, height: 28,
            borderRadius: '50%',
            background: 'linear-gradient(135deg, var(--peach-light), var(--peach))',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 12, fontWeight: 800, color: '#fff',
            boxShadow: '0 4px 10px var(--peach-glow)',
          }}>
            {pendingCount}
          </div>
        )}
      </div>

      {scopeOptions.length > 1 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <div style={{ minWidth: 130 }}>
            <Select
              value={scope}
              options={scopeOptions}
              onChange={v => setScope(v as TaskScope)}
            />
          </div>
          {scope !== 'mine' && (
            <div style={{ minWidth: 150 }}>
              {people.length === 0 ? (
                <div style={{
                  padding: '12px 15px', borderRadius: 12, fontSize: 13, fontWeight: 500,
                  color: 'var(--muted)', background: 'rgba(var(--ink),0.025)',
                }}>
                  {t('state.empty')}
                </div>
              ) : (
                <Select
                  value={assigneeId != null ? String(assigneeId) : ''}
                  options={people.map(p => ({ value: String(p.user_id), label: p.name }))}
                  onChange={v => setAssigneeId(Number(v))}
                  placeholder={t('tasks.assigneePlaceholder')}
                />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
