import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { useTelegram } from '../../hooks/useTelegram';

export type ScheduleView = 'resource' | 'event';

/**
 * Гибридная студия: две механики — два явно подписанных раздела (MA-01).
 *
 * Переключатель, а не список одно под другим: у индивидуальной записи нет дня
 * над мастерами, у расписания групп день — главная ось. На одном экране они
 * спорили бы за верх страницы, и карточки мастеров смешивались бы со
 * списком занятий.
 */
export default function ModeSwitch({ value, onChange }: { value: ScheduleView; onChange: (view: ScheduleView) => void }) {
  const { t } = useTranslation();
  const { vibrateLight } = useTelegram();
  const options: ScheduleView[] = ['resource', 'event'];

  return (
    <div className="px-5 pt-6 dt:pt-8">
      <div className="flex rounded-full bg-muted p-1 dt:max-w-[420px]">
        {options.map((option) => {
          const active = option === value;
          return (
            <button
              key={option}
              type="button"
              aria-pressed={active}
              onClick={() => {
                if (active) return;
                vibrateLight();
                onChange(option);
              }}
              className="relative flex h-10 flex-1 items-center justify-center rounded-full text-[13px] font-extrabold tracking-[-0.01em]"
            >
              {active && (
                <motion.span
                  layoutId="schedule-mode"
                  transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                  className="absolute inset-0 rounded-full bg-card shadow-soft"
                />
              )}
              <span className={`relative ${active ? 'text-foreground' : 'text-muted-foreground'}`}>
                {t(`booking.segment.${option}`)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
