import { motion } from 'framer-motion';
import { Press } from '../ui/Press';

type Props = {
  title: string;
  subtitle: string;
  /** Подпись после успешного копирования ссылки */
  copiedLabel: string;
  isCopied: boolean;
  onClick: () => void;
};

/**
 * «Приведи подругу».
 *
 * Раньше блок был залит персиковым градиентом во всю ширину — ДС Velora такие
 * заливки акцентом запрещает, и рядом с фотографиями студий он выглядел
 * дешевле всего на экране. Теперь обычная карточка, акцент живёт в иконке и
 * тонком кольце.
 *
 * Успех копирования показывает галочку на месте иконки, а не тост: действие
 * мелкое, всплывающее окно ради него было бы шумом.
 */
export default function ReferralBanner({ title, subtitle, copiedLabel, isCopied, onClick }: Props) {
  return (
    <div className="px-5 pt-3">
      <Press
        onClick={onClick}
        role="button"
        tabIndex={0}
        className="flex cursor-pointer items-center gap-4 rounded-[22px] bg-card p-5 shadow-soft ring-1 ring-inset ring-brand/25"
      >
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand/10">
          {isCopied ? (
            <motion.svg
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 500, damping: 22 }}
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--v-success)"
              strokeWidth="2.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-5 w-5"
            >
              <polyline points="20 6 9 17 4 12" />
            </motion.svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="var(--v-brand)" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
              <path d="M20 12v10H4V12 M22 7H2v5h20V7z M12 22V7 M12 7H7.5a2.5 2.5 0 010-5C11 2 12 7 12 7z M12 7h4.5a2.5 2.5 0 000-5C13 2 12 7 12 7z" />
            </svg>
          )}
        </span>

        <div className="min-w-0 flex-1">
          <div className="text-[14.5px] font-extrabold leading-tight tracking-[-0.01em] text-card-foreground">
            {title}
          </div>
          <div className="mt-1 text-[12px] font-medium leading-snug text-muted-foreground">
            {isCopied ? copiedLabel : subtitle}
          </div>
        </div>
      </Press>
    </div>
  );
}
