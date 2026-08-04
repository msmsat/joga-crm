import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useTelegram } from '../../hooks/useTelegram';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  /** Мелкая метка над заголовком: «Напрямок», «Прайс студії» */
  kicker?: string;
  title?: string;
  subtitle?: string;
  children?: ReactNode;
  /** Прижатая к низу зона действий: не уезжает вместе с прокруткой контента. */
  footer?: ReactNode;
  /** Лист во весь экран — для карты и длинных расписаний. */
  tall?: boolean;
  /** Поверх другого листа (оплата поверх выбора абонемента). */
  layer?: number;
};

// Листов может быть два один над другим (оплата поверх абонементов), поэтому
// прокрутку страницы отпускает только последний закрывшийся.
let openCount = 0;

/**
 * Единственный каркас всех модалок мини-приложения.
 *
 * Лист выезжает снизу — на телефоне это единственный жест, который читается как
 * «поднялось из-под пальца», а не «выпрыгнуло». Уходит он тремя способами:
 * крестиком, тапом по затемнению и смахиванием вниз, потому что на телефоне
 * рука сама тянется смахнуть. Пружина, а не кривая: лист должен слегка
 * притормозить в конце, как физический предмет.
 *
 * Затемнение без backdrop-filter намеренно — блюр во весь экран роняет первый
 * кадр открытия на телефонах, и лист «залипает» перед выездом.
 */
export function Sheet({
  isOpen,
  onClose,
  kicker,
  title,
  subtitle,
  children,
  footer,
  tall = false,
  layer = 0,
}: Props) {
  const { vibrateLight } = useTelegram();

  useEffect(() => {
    if (!isOpen) return;

    openCount += 1;
    document.body.style.overflow = 'hidden';

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);

    return () => {
      openCount -= 1;
      if (openCount === 0) document.body.style.overflow = '';
      window.removeEventListener('keydown', onKey);
    };
  }, [isOpen, onClose]);

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 flex items-end justify-center"
          style={{ zIndex: 200 + layer * 10 }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.22 }}
          onClick={onClose}
        >
          <div className="absolute inset-0 bg-[#1A1A1A]/45" />

          <motion.div
            onClick={(e) => e.stopPropagation()}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%', transition: { duration: 0.22, ease: [0.4, 0, 1, 1] } }}
            transition={{ type: 'spring', stiffness: 330, damping: 34, mass: 0.9 }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.5 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 110 || info.velocity.y > 700) {
                vibrateLight();
                onClose();
              }
            }}
            className={[
              'relative flex w-full max-w-[520px] flex-col overflow-hidden',
              'rounded-t-[28px] bg-card shadow-[0_-16px_48px_-12px_rgba(26,26,26,0.28)]',
              tall ? 'h-[92dvh]' : 'max-h-[88dvh]',
            ].join(' ')}
          >
            {/* Тёплое свечение под шапкой: лист не должен читаться белым листом
                бумаги — это единственное место, где акцент разлит пятном. */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 top-0 h-40"
              style={{
                background:
                  'radial-gradient(ellipse 90% 100% at 50% 0%, var(--v-brand-light)26 0%, transparent 70%)',
              }}
            />

            <div className="relative shrink-0 px-6 pt-3">
              <div
                className="mx-auto h-1 w-10 cursor-grab rounded-full bg-foreground/12"
                aria-hidden="true"
              />

              <motion.button
                type="button"
                onClick={onClose}
                whileTap={{ scale: 0.9 }}
                aria-label="Close"
                className="absolute right-5 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-muted text-muted-foreground"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  className="h-[17px] w-[17px]"
                >
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </motion.button>

              {(kicker || title || subtitle) && (
                <div className="pr-12 pt-5">
                  {kicker && (
                    <div className="text-[10.5px] font-extrabold uppercase tracking-[0.22em] text-brand">
                      {kicker}
                    </div>
                  )}
                  {title && (
                    <h2 className="mt-2 text-[27px] font-extrabold leading-[1.05] tracking-[-0.035em] text-card-foreground">
                      {title}
                    </h2>
                  )}
                  {subtitle && (
                    <p className="mt-1.5 text-[12.5px] font-medium leading-relaxed text-muted-foreground">
                      {subtitle}
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="relative flex-1 overflow-y-auto overscroll-contain px-6 pt-6">
              {children}
              {/* Хвост: последняя карточка не должна липнуть к краю листа. */}
              <div className={footer ? 'h-4' : 'h-6'} />
            </div>

            {footer && (
              <div className="pb-safe relative shrink-0 px-6 pb-5 pt-3">{footer}</div>
            )}
            {!footer && <div className="pb-safe" />}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

/** Персиковая кнопка на всю ширину — главное действие листа. */
export function SheetAction({
  children,
  onClick,
  disabled,
  tone = 'brand',
  type = 'button',
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  tone?: 'brand' | 'ghost' | 'danger';
  type?: 'button' | 'submit';
}) {
  const tones = {
    brand: 'bg-brand text-brand-foreground shadow-brand',
    ghost: 'bg-muted text-foreground',
    danger: 'bg-danger/12 text-danger',
  };

  return (
    <motion.button
      type={type}
      onClick={onClick}
      disabled={disabled}
      whileTap={{ scale: 0.975 }}
      transition={{ type: 'spring', stiffness: 420, damping: 30 }}
      className={`w-full rounded-[18px] py-4 text-[15px] font-extrabold tracking-[-0.01em] disabled:opacity-55 ${tones[tone]}`}
    >
      {children}
    </motion.button>
  );
}
