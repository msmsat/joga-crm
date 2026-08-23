import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Studio } from '../../api/studio';
import { studioState, STATE_COLOR } from '../../lib/studio-status';
import { Press } from '../ui/Press';

type Props = {
  studio: Studio;
  onOpen: () => void;
  /** Фирменный цвет студии — фон монограммы, когда фото филиала нет. */
  accentColor: string;
};

/**
 * Студия для того, кто в неё уже ходит.
 *
 * Постоянному клиенту не нужна витрина: где студия и когда она работает, он
 * знает. Ему важно другое — открыта ли она сейчас и как из неё быстро попасть в
 * услуги. Поэтому фото ужимается до марки, а всё остальное (адрес, часы, услуги)
 * остаётся ровно там же, где было у гостя, — за тем же тапом, в StudioSheet.
 *
 * Гостю та же студия показывается карточкой во весь кадр (StudioCard): у него
 * вопрос «что это за место», а не «открыто ли».
 */
export default function StudioStrip({ studio, onOpen, accentColor }: Props) {
  const { t } = useTranslation();
  const [imageFailed, setImageFailed] = useState(false);

  const state = studioState(studio.opens, studio.closes);
  const showPhoto = Boolean(studio.photo_url) && !imageFailed;

  return (
    <div className="px-5">
      <Press
        onClick={onOpen}
        role="button"
        tabIndex={0}
        className="group flex cursor-pointer items-center gap-3.5 rounded-[20px] bg-card p-3 shadow-soft transition-shadow duration-300 dt:rounded-[22px] dt:p-4 dt:hover:shadow-lift"
      >
        <span
          className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-[14px] dt:h-14 dt:w-14"
          style={showPhoto ? undefined : { background: accentColor }}
        >
          {showPhoto ? (
            <img
              src={studio.photo_url ?? undefined}
              alt=""
              loading="lazy"
              onError={() => setImageFailed(true)}
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="text-[18px] font-extrabold leading-none text-brand-foreground">
              {studio.name.charAt(0)}
            </span>
          )}
        </span>

        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-extrabold tracking-[-0.02em] text-card-foreground dt:text-[16px]">
            {studio.name}
          </span>
          <span className="mt-1 flex items-center gap-1.5">
            <span
              className="h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ background: STATE_COLOR[state] }}
            />
            <span className="truncate text-[12px] font-medium text-muted-foreground">
              {t(`studio.${state}`)}
              <span className="tabular-nums"> · {studio.opens}–{studio.closes}</span>
            </span>
          </span>
        </span>

        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--v-muted-foreground)"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-4 w-4 shrink-0 transition-transform duration-300 dt:group-hover:translate-x-0.5"
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </Press>
    </div>
  );
}
