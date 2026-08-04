import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Press } from '../ui/Press';

type Props = {
  onSelect: (id: string, label: string) => void;
};

/**
 * Направления студии — лента чипов с прокруткой вбок.
 *
 * Раньше это были карточки с полосками «заполненности», но заполненность была
 * выдуманной: сервер её не отдаёт, ширины стояли константами в разметке. Врать
 * данными ради красоты нельзя, а без полосок карточке нечего показывать —
 * поэтому чипы. Заодно они не спорят по весу с лентой студий выше.
 */
export default function DirectionsRail({ onSelect }: Props) {
  const { t } = useTranslation();

  const flows = [
    {
      id: 'yoga',
      name: t('home.flow_yoga'),
      icon: <path d="M12 2C12 2 6 7 6 13a6 6 0 0012 0c0-6-6-11-6-11z M12 22V13 M9 16l3-3 3 3" />,
    },
    {
      id: 'pilates',
      name: t('home.flow_pilates'),
      icon: (
        <>
          <ellipse cx="12" cy="12" rx="10" ry="5" />
          <line x1="12" y1="7" x2="12" y2="17" />
          <line x1="2" y1="12" x2="22" y2="12" />
        </>
      ),
    },
    {
      id: 'reformer_glow',
      name: t('home.flow_reformer_glow'),
      icon: <path d="M4 6c0 0 2-2 8-2s8 2 8 2 M4 12c0 0 2 2 8 2s8-2 8-2 M12 4v16" />,
    },
    {
      id: 'mfr',
      name: t('home.flow_mfr'),
      icon: (
        <>
          <circle cx="12" cy="8" r="3" />
          <path d="M7 21v-2a5 5 0 0110 0v2 M3 13c2-2 4-3 9-3s7 1 9 3" />
        </>
      ),
    },
    {
      id: 'healthy_back',
      name: t('home.flow_healthy_back'),
      icon: <path d="M12 22s-8-4.5-8-11.8A8 8 0 0112 2a8 8 0 018 8.2c0 7.3-8 11.8-8 11.8z" />,
    },
    {
      id: 'breathing',
      name: t('home.flow_breathing'),
      icon: (
        <>
          <path d="M12 3a2 2 0 000 4 2 2 0 000-4z M8 22c0-4 1-7 4-9M16 22c0-4-1-7-4-9" />
          <line x1="12" y1="7" x2="12" y2="13" />
        </>
      ),
    },
  ];

  return (
    <div className="flex gap-2.5 overflow-x-auto px-5 pb-1">
      {flows.map((flow, i) => (
        <motion.div
          key={flow.id}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.18 + i * 0.04, ease: [0.16, 1, 0.3, 1] }}
        >
          <Press
            onClick={() => onSelect(flow.id, flow.name)}
            role="button"
            tabIndex={0}
            className="flex h-11 shrink-0 cursor-pointer items-center gap-2 rounded-full bg-card pl-3.5 pr-4 shadow-soft"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--v-brand)"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-[17px] w-[17px] shrink-0"
            >
              {flow.icon}
            </svg>
            <span className="whitespace-nowrap text-[13px] font-bold tracking-[-0.01em] text-card-foreground">
              {flow.name}
            </span>
          </Press>
        </motion.div>
      ))}
    </div>
  );
}
