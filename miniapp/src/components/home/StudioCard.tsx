import { useState } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import type { Studio } from '../../api/studio';
import { studioState, STATE_COLOR } from '../../lib/studio-status';
import { Press } from '../ui/Press';
import { cn } from '../../lib/utils';

type Props = {
  studio: Studio;
  isActive: boolean;
  isLiked: boolean;
  onOpen: () => void;
  onToggleLike: () => void;
  /** Фирменный цвет студии — общий на все филиалы, свой тон каждому взять неоткуда. */
  accentColor: string;
  /**
   * Приглушать неактивные карточки. На телефоне это фокус карусели: активна та,
   * что под пальцем. На десктопе прокрутки может не быть вовсе (все филиалы
   * влезли в ряд), и тогда приглушение читается как «недоступно», а не «не
   * выбрано» — поэтому там его выключают.
   */
  dim?: boolean;
};

/**
 * Карточка студии в ленте выбора.
 *
 * Фотография вертикальная: студия — это место, а место снимают в рост, а не
 * квадратом. Заодно в один экран помещается и снимок, и всё, ради чего клиент
 * выбирает — статус, рейтинг, адрес.
 *
 * Два состояния — с фото и без — намеренно одинаковы по композиции. Студия без
 * фотографии не должна выглядеть как ошибка загрузки, поэтому вместо серого
 * плейсхолдера тёплый градиент её собственного оттенка и монограмма во всю
 * карточку.
 */
export default function StudioCard({
  studio,
  isActive,
  isLiked,
  onOpen,
  onToggleLike,
  accentColor,
  dim = true,
}: Props) {
  const { t } = useTranslation();
  const [imageFailed, setImageFailed] = useState(false);

  const showPhoto = Boolean(studio.photo_url) && !imageFailed;
  const state = studioState(studio.opens, studio.closes);

  return (
    <div className="w-[62vw] max-w-[252px] shrink-0 snap-center dt:w-[268px] dt:max-w-[268px]">
      <motion.div
        animate={{
          scale: !dim || isActive ? 1 : 0.955,
          opacity: !dim || isActive ? 1 : 0.7,
        }}
        transition={{ type: 'spring', stiffness: 260, damping: 30 }}
      >
        <Press
          onClick={onOpen}
          role="button"
          tabIndex={0}
          aria-label={`${studio.name}, ${studio.city}`}
          className="group cursor-pointer"
        >
          <div
            className="relative aspect-[3/4] overflow-hidden rounded-[24px] shadow-lift transition-shadow duration-300 dt:group-hover:shadow-[0_28px_64px_-16px_rgba(26,26,26,0.30)]"
            style={
              showPhoto
                ? undefined
                : {
                    background: `linear-gradient(155deg, ${accentColor} 0%, ${accentColor}CC 45%, #1A1A1A 140%)`,
                  }
            }
          >
            {showPhoto ? (
              <img
                src={studio.photo_url ?? undefined}
                alt=""
                loading="lazy"
                onError={() => setImageFailed(true)}
                /* Наезд на фото при наведении: у мыши это единственный способ
                   почувствовать, что карточка живая, до нажатия. */
                className="absolute inset-0 h-full w-full object-cover transition-transform duration-[600ms] ease-out dt:group-hover:scale-[1.06]"
              />
            ) : (
              /* Монограмма работает текстурой, а не буквой — обрезана краями
                 карточки и живёт под текстом, поэтому взята на 10%. */
              <span
                aria-hidden="true"
                className="pointer-events-none absolute -bottom-6 -right-3 select-none text-[170px] font-extrabold leading-none tracking-[-0.06em] text-white/10"
              >
                {studio.name.charAt(0)}
              </span>
            )}

            <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-black/15" />

            <span className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-black/40 px-2.5 py-1.5">
              <motion.span
                animate={
                  state === 'open' ? { opacity: [1, 0.35, 1] } : { opacity: 1 }
                }
                transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
                className="h-1.5 w-1.5 rounded-full"
                style={{ background: STATE_COLOR[state] }}
              />
              <span className="text-[9.5px] font-bold uppercase tracking-[0.1em] text-white">
                {t(`studio.${state}`)}
              </span>
              <span className="text-[9.5px] font-bold tabular-nums tracking-[0.05em] text-white/70">
                · {studio.opens}–{studio.closes}
              </span>
            </span>

            <div className="absolute inset-x-0 bottom-0 p-4">
              <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/70">
                {studio.city}
              </div>
              <h3 className="mt-1 text-[22px] font-extrabold leading-[1.05] tracking-[-0.03em] text-white">
                {studio.name}
              </h3>
              <div className="mt-1.5 flex items-center gap-1.5 text-[11.5px] font-medium text-white/85">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3 shrink-0">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" />
                  <circle cx="12" cy="10" r="3" />
                </svg>
                <span className="truncate">{studio.address}</span>
              </div>
            </div>

            <motion.div
              animate={{ opacity: isActive ? 1 : 0 }}
              transition={{ duration: 0.25 }}
              className="pointer-events-none absolute inset-0 rounded-[24px] ring-2 ring-inset ring-brand"
            />
          </div>
        </Press>

        {/* Сердце — под фотографией, а не поверх: на снимке оно спорит с
            названием. Рейтинга и отзывов здесь больше нет — источника для них
            нет и не будет (см. STATUS.md), выдумывать цифры нельзя. */}
        <div className="flex items-center justify-end gap-2 px-1.5 pt-3">
          <motion.button
            type="button"
            onClick={onToggleLike}
            whileTap={{ scale: 0.85 }}
            animate={isLiked ? { scale: [1, 1.25, 1] } : { scale: 1 }}
            transition={{ type: 'spring', stiffness: 420, damping: 18 }}
            aria-label={t('studio.like')}
            aria-pressed={isLiked}
            className={cn(
              'flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors',
              isLiked ? 'bg-brand/14' : 'bg-muted',
            )}
          >
            <svg
              viewBox="0 0 24 24"
              fill={isLiked ? 'var(--v-brand)' : 'none'}
              stroke={isLiked ? 'var(--v-brand)' : 'var(--v-muted-foreground)'}
              strokeWidth="1.9"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-4 w-4"
            >
              <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
            </svg>
          </motion.button>
        </div>
      </motion.div>
    </div>
  );
}
