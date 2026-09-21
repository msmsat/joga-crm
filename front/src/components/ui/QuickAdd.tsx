import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ModalShell, ModalHeader, ModalBody } from './modal';
import { Button } from './Button';
import { NAV, JOURNAL_ENTRY } from './navItems';
import { getStudioRole } from '../../utils/auth';

// ─── БЫСТРОЕ СОЗДАНИЕ (телефон) ──────────────────────────────────────────────
// Модель кнопок на телефоне: снизу — КУДА перейти, «+» — ЧТО создать, «AI» —
// ассистент. До этого «+» просто уводил в Журнал, и создать клиента или
// операцию можно было, только вспомнив, в каком разделе лежит нужная кнопка.
//
// Второй копии форм здесь нет и не будет: каждая форма уже умеет открываться
// по адресу (?ai=<интент> — hooks/useAiIntent, тот же механизм, которым водит
// человека ассистент), поэтому пункт — это обычная навигация. Финансам нужна
// ещё и вкладка: подписан на интент сам раздел вкладки, и без ?tab= он просто
// не смонтируется (см. _INTENT_TAB в back/services/ai_tools.py).
const ICONS = new Map([...NAV, JOURNAL_ENTRY].map(item => [item.key, item.icon]));

const ITEMS: { key: string; label: string; to: string; owner?: boolean }[] = [
  { key: 'journal', label: 'journal:newBooking.title', to: '/dashboard/journal?ai=lesson.create' },
  { key: 'clients', label: 'clients:addModal.title', to: '/dashboard/clients?ai=client.create' },
  { key: 'staff', label: 'staff:toolbar.addEmployee', to: '/dashboard/staff?ai=staff.create', owner: true },
  {
    key: 'finances', label: 'finances:operations.newOperationTitle', owner: true,
    to: '/dashboard/finances?tab=operations&ai=operation.create',
  },
];

export interface QuickAddProps {
  onClose: () => void;
}

export function QuickAdd({ onClose }: QuickAddProps) {
  const { t } = useTranslation('menu');
  const navigate = useNavigate();
  const isOwner = getStudioRole() === 'owner';

  return (
    <ModalShell onClose={onClose} size="sm" maxWidth="420px">
      <ModalHeader title={t('navbar.create')} />
      <ModalBody>
        {/* Своя колонка внутри тела: на телефоне окно становится шитом снизу, и
            последняя кнопка упиралась бы в индикатор жестов iPhone — футера,
            который отбивает безопасную зону, у этого окна нет. */}
        <div style={{
          display: 'flex', flexDirection: 'column', gap: '8px',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        }}>
          {ITEMS.filter(item => !item.owner || isOwner).map(item => (
            <Button
              key={item.key}
              variant="ghost"
              fullWidth
              icon={ICONS.get(item.key)}
              onClick={() => { onClose(); navigate(item.to); }}
              style={{ justifyContent: 'flex-start', gap: '12px', padding: '14px 16px' }}
            >
              {t(item.label)}
            </Button>
          ))}
        </div>
      </ModalBody>
    </ModalShell>
  );
}
