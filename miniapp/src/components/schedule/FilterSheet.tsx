import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Sheet, SheetAction } from '../ui/Sheet';
import { ALL_BRANCHES, toggleBranch } from '../../lib/branchSelection';
import type { Studio } from '../../api/studio';

export type Filters = {
  /** Выбранные студии (филиалы). Пустой список — «Все». */
  studioIds: number[];
  /** HB-19: числовой ID услуги. По названию два одноимённых направления
   *  разных филиалов сливались в один пункт и один фильтр. */
  service: number | null;
  /** `users.id` тренера — по той же причине, что и услуга: два однофамильца
   *  сливались в один пункт, а QR-код сотрудника называет его номером. */
  teacher: number | null;
};

export type ServiceOption = { id: number; name: string };

export type TeacherOption = { id: number; name: string };

type Props = {
  isOpen: boolean;
  onClose: () => void;
  value: Filters;
  onChange: (next: Filters) => void;
  studios: Studio[];
  isMultiStudio: boolean;
  /** Варианты собраны из реально загруженных занятий, а не из справочника. */
  services: ServiceOption[];
  teachers: TeacherOption[];
  resultCount: number;
};

/** Чип-опция: единственная форма выбора во всём листе фильтров. */
function Chip({
  isActive,
  onClick,
  children,
}: {
  isActive: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <motion.button
      type="button"
      aria-pressed={isActive}
      onClick={onClick}
      whileTap={{ scale: 0.94 }}
      transition={{ type: 'spring', stiffness: 440, damping: 28 }}
      className={`rounded-full px-3.5 py-2 text-[12.5px] font-bold tracking-[-0.01em] transition-colors ${
        isActive
          ? 'bg-brand text-brand-foreground shadow-brand'
          : 'bg-background text-muted-foreground'
      }`}
    >
      {children}
    </motion.button>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="pt-5 first:pt-0">
      <div className="pb-3 text-[10px] font-extrabold uppercase tracking-[0.22em] text-muted-foreground">
        {label}
      </div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

export default function FilterSheet({
  isOpen,
  onClose,
  value,
  onChange,
  studios,
  isMultiStudio,
  services,
  teachers,
  resultCount,
}: Props) {
  const { t } = useTranslation();
  const studioIds = studios.map((studio) => studio.id);

  return (
    <Sheet
      isOpen={isOpen}
      onClose={onClose}
      kicker={t('schedule.filters')}
      title={t('schedule.filters_title')}
      footer={
        <div className="flex gap-2.5">
          <button
            type="button"
            onClick={() => onChange({ studioIds: ALL_BRANCHES, service: null, teacher: null })}
            className="flex shrink-0 items-center justify-center rounded-[18px] bg-muted px-5 py-4 text-[14px] font-extrabold text-foreground"
          >
            {t('schedule.reset')}
          </button>
          <div className="flex-1">
            <SheetAction onClick={onClose}>
              {t('schedule.show_results', { count: resultCount })}
            </SheetAction>
          </div>
        </div>
      }
    >
      {/* Студии — множественный выбор: «Все» или любые из них. Снять последнюю
          нельзя — выбор сам возвращается к «Все» (lib/branchSelection.ts). */}
      {isMultiStudio && (
        <Group label={t('schedule.filter_studio')}>
          <Chip
            isActive={value.studioIds.length === 0}
            onClick={() => onChange({ ...value, studioIds: ALL_BRANCHES })}
          >
            {t('schedule.filter_all')}
          </Chip>
          {studios.map((studio) => (
            <Chip
              key={studio.id}
              isActive={value.studioIds.includes(studio.id)}
              onClick={() => onChange({ ...value, studioIds: toggleBranch(value.studioIds, studio.id, studioIds) })}
            >
              {studio.name}
            </Chip>
          ))}
        </Group>
      )}

      <Group label={t('schedule.filter_service')}>
        <Chip isActive={value.service === null} onClick={() => onChange({ ...value, service: null })}>
          {t('schedule.filter_all')}
        </Chip>
        {services.map((service) => (
          <Chip
            key={service.id}
            isActive={value.service === service.id}
            onClick={() => onChange({ ...value, service: service.id })}
          >
            {t(`lesson.name.${service.name}`, { defaultValue: service.name })}
          </Chip>
        ))}
      </Group>

      <Group label={t('schedule.filter_teacher')}>
        <Chip isActive={value.teacher === null} onClick={() => onChange({ ...value, teacher: null })}>
          {t('schedule.filter_all')}
        </Chip>
        {teachers.map((teacher) => (
          <Chip
            key={teacher.id}
            isActive={value.teacher === teacher.id}
            onClick={() => onChange({ ...value, teacher: teacher.id })}
          >
            {teacher.name}
          </Chip>
        ))}
      </Group>
    </Sheet>
  );
}
