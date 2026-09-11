import { motion } from 'framer-motion';
import { Press } from '../../../components/ui/Press';
import { resolveImageUrl } from '../../../api/client';
import type { StaffDayMember } from '../../../api/hybrid.types';

type Props = {
  master: StaffDayMember;
  index: number;
  freeLabel: string;
  busyLabel: string;
  onClick: () => void;
};

const initials = (master: StaffDayMember) =>
  [master.name, master.last_name].filter(Boolean).map((part) => part![0]).join('').slice(0, 2);

/**
 * Мастер в списке дня.
 *
 * Занятый показывается, а не прячется: человек на смене — это не выходной, и
 * исчезнувшая карточка заставила бы клиента гадать, работает мастер сегодня
 * или нет. Поэтому у него свой вид — приглушённый, без нажатия и с прямой
 * подписью «нет свободного времени», а не просто серый силуэт.
 */
export default function MasterCard({ master, index, freeLabel, busyLabel, onClick }: Props) {
  const free = master.free_count > 0;
  const photo = resolveImageUrl(master.photo_url);

  const card = (
    <div
      className={`flex items-center gap-3.5 rounded-[20px] px-4 py-3.5 dt:px-5 dt:py-4 ${
        free ? 'bg-card shadow-soft' : 'bg-muted/60'
      }`}
    >
      {photo ? (
        <img
          src={photo}
          alt=""
          className={`h-12 w-12 shrink-0 rounded-full object-cover dt:h-14 dt:w-14 ${
            free ? '' : 'opacity-45 grayscale'
          }`}
        />
      ) : (
        <span
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-[14px] font-extrabold dt:h-14 dt:w-14 ${
            free ? 'bg-brand/12 text-brand' : 'bg-foreground/5 text-muted-foreground'
          }`}
        >
          {initials(master)}
        </span>
      )}

      <div className="min-w-0 flex-1">
        <div
          className={`truncate text-[14.5px] font-extrabold tracking-[-0.015em] dt:text-[15px] ${
            free ? 'text-card-foreground' : 'text-muted-foreground'
          }`}
        >
          {[master.name, master.last_name].filter(Boolean).join(' ')}
        </div>
        <div
          className={`mt-0.5 truncate text-[12px] font-semibold dt:text-[12.5px] ${
            free ? 'text-brand' : 'text-muted-foreground/80'
          }`}
        >
          {free ? freeLabel : busyLabel}
        </div>
      </div>

      {free && (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--v-muted-foreground)"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-4 w-4 shrink-0"
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>
      )}
    </div>
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, delay: Math.min(index, 6) * 0.035, ease: [0.16, 1, 0.3, 1] }}
    >
      {free ? (
        <Press role="button" tabIndex={0} onClick={onClick} className="cursor-pointer">
          {card}
        </Press>
      ) : (
        /* Не Press и не кнопка: нажимать нечего, и ложный отклик на касание
           обещал бы шаг, которого не будет. */
        <div aria-disabled>{card}</div>
      )}
    </motion.div>
  );
}
