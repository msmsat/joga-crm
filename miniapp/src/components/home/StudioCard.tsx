import { useState } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import type { Studio } from '../../api/studio';
import { studioState, STATE_COLOR } from '../../lib/studio-status';
import { Press } from '../ui/Press';

type Props = {
  studio: Studio;
  isActive: boolean;
  isLiked: boolean;
  onOpen: () => void;
  onToggleLike: () => void;
  /** Фирменный цвет студии — общий на все филиалы, свой тон каждому взять неоткуда. */
  accentColor: string;
  /**
   * Филиал один — карточка занимает всю колонку и не листается: карусель из
   * одного элемента обещает вбок то, чего там нет.
   */
  solo?: boolean;
  /**
   * Приглушать неактивные карточки. На телефоне это фокус карусели: активна та,
   * что под пальцем. На десктопе прокрутки может не быть вовсе (все филиалы
   * влезли в ряд), и тогда приглушение читается как «недоступно», а не «не
   * выбрано» — поэтому там его выключают.
   */
  dim?: boolean;
};

/**
 * Карточка студии — главный визуальный объект гостевой главной.
 *
 * Кадр широкий (16:10): интерьер зала — это ширина, а не рост, а на первом
 * экране телефона высокая карточка отталкивает вниз всё остальное. Снимок
 * приходит из карточки филиала в CRM (Каталог → Филиалы, поле фото) — фронт его
 * только показывает.
 *
 * Внутри кадра ровно четыре вещи: состояние с часами, избранное, название и
 * строка «город · адрес». Иконки-булавки у адреса нет намеренно — адрес
 * опознаётся как адрес без подсказки, а на фото каждый лишний знак читается
 * шумом.
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
  solo = false,
  dim = true,
}: Props) {
  const { t } = useTranslation();
  const [imageFailed, setImageFailed] = useState(false);

  const showPhoto = Boolean(studio.photo_url) && !imageFailed;
  const state = studioState(studio.opens, studio.closes);
  const place = [studio.city, studio.address].filter(Boolean).join(' · ');

  return (
    <div
      className={
        solo
          ? 'w-full'
          : /* Телефон — карточка почти во весь экран, следующая выглядывает
               краем: так видно, что лента листается. Десктоп — ровно два в
               ряд (половина колонки минус половина зазора), чтобы третий
               филиал не уезжал за край, откуда мышью его не достать. */
            'w-[85vw] max-w-[420px] shrink-0 snap-center dt:w-[calc(50%-0.5rem)] dt:max-w-none'
      }
    >
      <motion.div
        animate={{
          scale: solo || !dim || isActive ? 1 : 0.965,
          opacity: solo || !dim || isActive ? 1 : 0.72,
        }}
        transition={{ type: 'spring', stiffness: 260, damping: 30 }}
      >
        <Press
          onClick={onOpen}
          role="button"
          tabIndex={0}
          aria-label={`${studio.name}${studio.city ? `, ${studio.city}` : ''}`}
          className="group cursor-pointer"
        >
          <div
            className={
              /* Кадр 16:10 хорош, пока карточка узкая: в ленте она шириной
                 85vw телефона или половины колонки на десктопе. Единственному
                 филиалу карточка отдаётся во всю ширину — и та же пропорция
                 превращается в стену: 980px колонки дают больше 500px высоты,
                 фотография занимает первый экран целиком, а приветствие и
                 направления уезжают за сгиб. Поэтому у одиночной карточки есть
                 потолок высоты: кадр остаётся широким баннером на любой ширине
                 колонки. На телефоне потолок почти не срабатывает — 16:10 от
                 350px и так укладывается около него. */
              'relative aspect-[16/10] overflow-hidden rounded-[26px] shadow-lift transition-shadow duration-300 dt:group-hover:shadow-hover' +
              (solo ? ' max-h-[190px] dt:max-h-[260px]' : '')
            }
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
                className="absolute inset-0 h-full w-full object-cover transition-transform duration-[600ms] ease-out dt:group-hover:scale-[1.05]"
              />
            ) : (
              /* Монограмма работает текстурой, а не буквой — обрезана краями
                 карточки и живёт под текстом, поэтому взята на 10%. */
              <span
                aria-hidden="true"
                className="pointer-events-none absolute -bottom-8 -right-4 select-none text-[190px] font-extrabold leading-none tracking-[-0.06em] text-white/10"
              >
                {studio.name.charAt(0)}
              </span>
            )}

            {/* Затемнение снизу под текст: фото студий бывают светлыми, и без
                него белое название пропадает на окне или стене. */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-black/20" />

            <span className="absolute left-3.5 top-3.5 flex items-center gap-1.5 rounded-full bg-black/45 px-2.5 py-1.5">
              <motion.span
                animate={state === 'open' ? { opacity: [1, 0.35, 1] } : { opacity: 1 }}
                transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
                className="h-1.5 w-1.5 rounded-full"
                style={{ background: STATE_COLOR[state] }}
              />
              <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-white">
                {t(`studio.${state}`)}
              </span>
              <span className="text-[10px] font-bold tabular-nums tracking-[0.04em] text-white/70">
                · {studio.opens}–{studio.closes}
              </span>
            </span>

            {/* Сердце внутри кадра, справа: пилюля тёмного стекла держит
                контраст поверх фото любой яркости — как у бейджа состояния
                слева. stopPropagation — иначе тап по сердцу открывал бы
                карточку студии, лежащую под ним. */}
            <motion.button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggleLike();
              }}
              whileTap={{ scale: 0.85 }}
              animate={isLiked ? { scale: [1, 1.25, 1] } : { scale: 1 }}
              transition={{ type: 'spring', stiffness: 420, damping: 18 }}
              aria-label={t('studio.like')}
              aria-pressed={isLiked}
              className="absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-full bg-black/40"
            >
              <svg
                viewBox="0 0 24 24"
                fill={isLiked ? 'var(--v-brand)' : 'none'}
                stroke={isLiked ? 'var(--v-brand)' : '#fff'}
                strokeWidth="1.9"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-[17px] w-[17px]"
              >
                <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
              </svg>
            </motion.button>

            <div className="absolute inset-x-0 bottom-0 p-4 dt:p-5">
              {/* Название в две строки максимум: студии с длинными вывесками
                  («Namaste Yoga & Pilates Studio») иначе выдавливают адрес за
                  край кадра. */}
              <h3 className="line-clamp-2 text-[24px] font-extrabold leading-[1.06] tracking-[-0.03em] text-white dt:text-[26px]">
                {studio.name}
              </h3>
              {place && (
                <div className="mt-1.5 truncate text-[12px] font-medium text-white/85">
                  {place}
                </div>
              )}
            </div>

            {!solo && (
              /* Подсветка активной — знак карусели: «вот та, что под пальцем».
                 В сетке десктопа карусели нет, и кольцо на первой карточке
                 читалось бы как «эта студия выбрана», хотя ничего не выбрано. */
              <motion.div
                animate={{ opacity: isActive ? 1 : 0 }}
                transition={{ duration: 0.25 }}
                className="pointer-events-none absolute inset-0 rounded-[26px] ring-2 ring-inset ring-brand dt:hidden"
              />
            )}
          </div>
        </Press>
      </motion.div>
    </div>
  );
}
