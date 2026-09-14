import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { useTelegram } from '../../../hooks/useTelegram';
import { ALL_BRANCHES, toggleBranch } from '../../../lib/branchSelection';
import type { Studio } from '../../../api/studio';

type Props = {
  branches: Studio[];
  /** Пустой список — «Все». */
  selected: number[];
  onChange: (next: number[]) => void;
};

/**
 * Филиалы над мастерами: «Все» или любые из них.
 *
 * Выбор множественный: человеку, которому одинаково удобны два адреса из трёх,
 * не нужно листать мастеров дважды. Время и бронь всё равно считаются по одному
 * адресу — его спросит лист, если мастер принимает в нескольких выбранных.
 */
export default function BranchFilter({ branches, selected, onChange }: Props) {
  const { t } = useTranslation();
  const { vibrateLight } = useTelegram();
  if (branches.length < 2) return null;

  const ids = branches.map((branch) => branch.id);
  const pick = (next: number[]) => {
    vibrateLight();
    onChange(next);
  };

  return (
    <div className="flex gap-2 overflow-x-auto px-5 pt-6 dt:flex-wrap dt:overflow-visible">
      <Chip active={selected.length === 0} onClick={() => pick(ALL_BRANCHES)}>
        {t('booking.allBranches')}
      </Chip>
      {branches.map((branch) => (
        <Chip key={branch.id} active={selected.includes(branch.id)} onClick={() => pick(toggleBranch(selected, branch.id, ids))}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 opacity-70">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" />
            <circle cx="12" cy="10" r="3" />
          </svg>
          {branch.name}
        </Chip>
      ))}
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <motion.button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      whileTap={{ scale: 0.95 }}
      className={`flex h-10 shrink-0 items-center gap-1.5 rounded-full px-4 text-[12.5px] font-bold tracking-[-0.01em] has-[svg]:pl-3 ${
        active ? 'bg-foreground text-background' : 'bg-card text-foreground shadow-soft'
      }`}
    >
      {children}
    </motion.button>
  );
}
