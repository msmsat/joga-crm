import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Press } from '../ui/Press';
import type { StudioService } from '../../api/studio';

type Props = {
  services: StudioService[];
  onSelect: (serviceId: string, label: string) => void;
};

// Иконки закреплены за теми же ключами, что и `lesson.name.*` в locales/*.json —
// у демо-услуг studio.name буквально совпадает с этими ключами (см. LessonCard,
// ServiceScheduleSheet: тот же t(`lesson.name.${name}`, { defaultValue: name })).
// У настоящей студии название обычно не совпадёт — тогда идёт дефолтная иконка.
const ICONS: Record<string, React.ReactNode> = {
  yoga: <path d="M12 2C12 2 6 7 6 13a6 6 0 0012 0c0-6-6-11-6-11z M12 22V13 M9 16l3-3 3 3" />,
  pilates: (
    <>
      <ellipse cx="12" cy="12" rx="10" ry="5" />
      <line x1="12" y1="7" x2="12" y2="17" />
      <line x1="2" y1="12" x2="22" y2="12" />
    </>
  ),
  reformer_glow: <path d="M4 6c0 0 2-2 8-2s8 2 8 2 M4 12c0 0 2 2 8 2s8-2 8-2 M12 4v16" />,
  mfr: (
    <>
      <circle cx="12" cy="8" r="3" />
      <path d="M7 21v-2a5 5 0 0110 0v2 M3 13c2-2 4-3 9-3s7 1 9 3" />
    </>
  ),
  healthy_back: <path d="M12 22s-8-4.5-8-11.8A8 8 0 0112 2a8 8 0 018 8.2c0 7.3-8 11.8-8 11.8z" />,
  breathing: (
    <>
      <path d="M12 3a2 2 0 000 4 2 2 0 000-4z M8 22c0-4 1-7 4-9M16 22c0-4-1-7-4-9" />
      <line x1="12" y1="7" x2="12" y2="13" />
    </>
  ),
};

/** Дефолтная иконка направления — лотос, когда название услуги незнакомо. */
const DEFAULT_ICON = (
  <path d="M12 21c-4-2.5-6-5.6-6-9a6 6 0 0112 0c0 3.4-2 6.5-6 9z M12 21c4-2.5 6-5.6 6-9" />
);

/**
 * Направления студии — лента чипов с прокруткой вбок.
 *
 * Раньше это были карточки с полосками «заполненности», но заполненность была
 * выдуманной: сервер её не отдаёт, ширины стояли константами в разметке. Врать
 * данными ради красоты нельзя, а без полосок карточке нечего показывать —
 * поэтому чипы. Заодно они не спорят по весу с лентой студий выше.
 *
 * Источник направлений — реальные услуги студии (`GET /global/studio`), а не
 * шесть зашитых констант.
 */
export default function DirectionsRail({ services, onSelect }: Props) {
  const { t } = useTranslation();

  return (
    /* На десктопе лента перестаёт быть лентой: горизонтальная прокрутка мышью —
       это спрятанный контент, а места хватает, чтобы разложить чипы рядами. */
    <div className="flex gap-2.5 overflow-x-auto px-5 pb-1 dt:flex-wrap dt:gap-3 dt:overflow-visible">
      {services.map((service, i) => {
        const label = t(`lesson.name.${service.name}`, { defaultValue: service.name });

        return (
          <motion.div
            key={service.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.18 + i * 0.04, ease: [0.16, 1, 0.3, 1] }}
          >
            <Press
              onClick={() => onSelect(service.name, label)}
              role="button"
              tabIndex={0}
              className="flex h-11 shrink-0 cursor-pointer items-center gap-2 rounded-full bg-card pl-3.5 pr-4 shadow-soft ring-1 ring-inset ring-transparent transition-shadow duration-300 dt:h-[52px] dt:gap-2.5 dt:pl-4.5 dt:pr-5 dt:hover:shadow-lift dt:hover:ring-brand/30"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="var(--v-brand)"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-[17px] w-[17px] shrink-0 dt:h-[19px] dt:w-[19px]"
              >
                {ICONS[service.name] ?? DEFAULT_ICON}
              </svg>
              <span className="whitespace-nowrap text-[13px] font-bold tracking-[-0.01em] text-card-foreground dt:text-[14px]">
                {label}
              </span>
            </Press>
          </motion.div>
        );
      })}
    </div>
  );
}
