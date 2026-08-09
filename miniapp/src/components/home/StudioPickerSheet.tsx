import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Sheet } from '../ui/Sheet';
import { studioState, STATE_COLOR } from '../../lib/studio-status';
import type { Studio } from '../../api/studio';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  studios: Studio[];
  /** Какая студия подсвечена при открытии */
  activeId: number;
  onPick: (studio: Studio) => void;
};

/**
 * Выбор филиала — списком.
 *
 * Карты в мини-приложении нет: сначала здесь была схема с метками по выдуманным
 * координатам (`{x, y}` в процентах — источника для них нет и не будет, пока у
 * филиала не появятся `lat`/`lng` и поле ввода в Каталоге CRM), потом остался
 * список под вывеской «Карта». Вывеску сняли: лист открывается ровно в одном
 * месте — когда клиент выбрал направление, а филиалов несколько, и вопрос там
 * один, «в какой студии». Тап по строке сразу выбирает, подтверждения нет.
 */
export default function StudioPickerSheet({ isOpen, onClose, studios, activeId, onPick }: Props) {
  const { t } = useTranslation();

  return (
    <Sheet isOpen={isOpen} onClose={onClose} title={t('studio.choose_studio')}>
      <div className="flex flex-col gap-2.5">
        {studios.map((studio, i) => {
          const state = studioState(studio.opens, studio.closes);
          const isActive = studio.id === activeId;

          return (
            <motion.button
              key={studio.id}
              type="button"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: i * 0.04, ease: [0.16, 1, 0.3, 1] }}
              whileTap={{ scale: 0.985 }}
              onClick={() => onPick(studio)}
              className={`flex items-center gap-3 rounded-[20px] px-4 py-4 text-left transition ${
                isActive ? 'bg-brand/10 ring-1 ring-brand/50' : 'bg-background'
              }`}
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-card text-[13px] font-extrabold text-foreground shadow-soft">
                {studio.name.charAt(0)}
              </span>

              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-extrabold tracking-[-0.02em] text-foreground">
                  {studio.name}
                </span>
                <span className="mt-0.5 block truncate text-[11.5px] font-medium text-muted-foreground">
                  {[studio.city, studio.address].filter(Boolean).join(' · ')}
                </span>
                <span className="mt-1.5 flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: STATE_COLOR[state] }} />
                  <span className="text-[11px] font-bold text-foreground">{t(`studio.${state}`)}</span>
                  <span className="text-[11px] font-medium text-muted-foreground">
                    · {studio.opens} — {studio.closes}
                  </span>
                </span>
              </span>

              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="var(--v-brand)"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-4 w-4 shrink-0"
              >
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </motion.button>
          );
        })}
      </div>
    </Sheet>
  );
}
