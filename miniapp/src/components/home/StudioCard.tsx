import { useState } from 'react';
import { motion } from 'framer-motion';
import type { Studio } from '../../data/studios';
import { Press } from '../ui/Press';
import { cn } from '../../lib/utils';

type Props = {
  studio: Studio;
  isActive: boolean;
  onClick: () => void;
};

/**
 * Карточка студии в ленте выбора.
 *
 * Два состояния — с фото и без — намеренно одинаковы по композиции: те же
 * пропорции, та же посадка текста, тот же скрим. Отличается только подложка.
 * Студия без фотографии не должна выглядеть как ошибка загрузки, поэтому
 * вместо серого плейсхолдера — тёплый градиент её собственного оттенка,
 * монограмма во всю карточку и адрес крупнее обычного: если картинки нет,
 * ценность несёт «где это».
 */
export default function StudioCard({ studio, isActive, onClick }: Props) {
  const [imageFailed, setImageFailed] = useState(false);
  const showPhoto = Boolean(studio.photo) && !imageFailed;

  return (
    <Press
      onClick={onClick}
      role="button"
      tabIndex={0}
      aria-label={`${studio.name}, ${studio.city}`}
      className="w-[76vw] max-w-[300px] shrink-0 cursor-pointer snap-center"
    >
      <motion.div
        animate={{ scale: isActive ? 1 : 0.955, opacity: isActive ? 1 : 0.72 }}
        transition={{ type: 'spring', stiffness: 260, damping: 30 }}
        className="relative aspect-square overflow-hidden rounded-[26px] shadow-lift"
        style={
          showPhoto
            ? undefined
            : {
                background: `linear-gradient(155deg, ${studio.tint} 0%, ${studio.tint}CC 45%, #1A1A1A 140%)`,
              }
        }
      >
        {showPhoto ? (
          <img
            src={studio.photo}
            alt=""
            loading="lazy"
            onError={() => setImageFailed(true)}
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          /* Монограмма работает текстурой, а не буквой — она обрезана краями
             карточки и живёт под текстом, поэтому взята на 10% прозрачности. */
          <span
            aria-hidden="true"
            className="pointer-events-none absolute -bottom-8 -right-4 select-none text-[190px] font-extrabold leading-none tracking-[-0.06em] text-white/10"
          >
            {studio.name.charAt(0)}
          </span>
        )}

        {/* Скрим: без него белый текст на светлой части фото не читается */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-transparent" />

        <div className="absolute left-4 top-4">
          <span className="flex items-center gap-1.5 rounded-full bg-black/35 px-2.5 py-1.5 backdrop-blur-md">
            <span
              className={cn(
                'h-1.5 w-1.5 rounded-full',
                studio.isOpen ? 'bg-success' : 'bg-danger',
              )}
            />
            <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-white">
              {studio.hours}
            </span>
          </span>
        </div>

        <div className="absolute inset-x-0 bottom-0 p-5">
          <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/70">
            {studio.city}
          </div>
          <h3 className="mt-1.5 text-[27px] font-extrabold leading-[1.05] tracking-[-0.03em] text-white">
            {studio.name}
          </h3>
          <div
            className={cn(
              'mt-2 flex items-center gap-1.5 font-medium text-white/80',
              /* Без фото адрес — главная информация на карточке, поэтому крупнее */
              showPhoto ? 'text-[12px]' : 'text-[13.5px] text-white/90',
            )}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 shrink-0">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
            {studio.address}
          </div>
        </div>

        {/* Выбранная студия обводится персиковым — единственное место, где
            акцент касается карточек. */}
        <motion.div
          animate={{ opacity: isActive ? 1 : 0 }}
          transition={{ duration: 0.25 }}
          className="pointer-events-none absolute inset-0 rounded-[26px] ring-2 ring-inset ring-brand"
        />
      </motion.div>
    </Press>
  );
}
