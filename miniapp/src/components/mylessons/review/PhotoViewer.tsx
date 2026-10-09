import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';

type Props = {
  /** Адреса кадров, уже готовые для <img>. */
  sources: string[];
  /** Открытый кадр; null — просмотр закрыт. */
  index: number | null;
  onIndex: (index: number | null) => void;
  /** Есть — записка в правке: снимок можно убрать прямо отсюда. */
  onRemove?: (index: number) => void;
};

/**
 * Снимок отзыва во весь экран. Листается свайпом и стрелками, закрывается
 * тапом мимо кадра, крестиком и Esc. Поверх листов кита (у тех 200+): снимок
 * открывают и из листа занятия.
 */
export default function PhotoViewer({ sources, index, onIndex, onRemove }: Props) {
  const { t } = useTranslation();
  const start = useRef<number | null>(null);
  // Свайп кончается отпусканием пальца, а за ним браузер шлёт клик — тот
  // закрыл бы просмотр. Сдвинутый палец гасит ровно этот один клик.
  const swiped = useRef(false);
  const open = index !== null && sources[index] !== undefined;
  const count = sources.length;

  useEffect(() => {
    if (!open) return;
    const current = index ?? 0;
    // На перехвате и с остановкой: Esc закрывает только просмотр, а не
    // заодно лист занятия под ним (Sheet слушает тот же window).
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onIndex(null);
      }
      if (event.key === 'ArrowRight' && current < count - 1) onIndex(current + 1);
      if (event.key === 'ArrowLeft' && current > 0) onIndex(current - 1);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, index, count, onIndex]);

  if (!open) return null;

  const step = (delta: number) => {
    const next = index + delta;
    if (next >= 0 && next < count) onIndex(next);
  };

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('mylessons.review.open_photo', { index: index + 1, count })}
      className="memo-viewer fixed inset-0 z-[400] flex items-center justify-center bg-[#0E0D0C]/92"
      onClick={() => {
        if (swiped.current) swiped.current = false;
        else onIndex(null);
      }}
      onPointerDown={(event) => { start.current = event.clientX; }}
      onPointerUp={(event) => {
        if (start.current === null) return;
        const dx = event.clientX - start.current;
        start.current = null;
        swiped.current = Math.abs(dx) > 10;
        if (Math.abs(dx) > 48) step(dx < 0 ? 1 : -1);
      }}
    >
      <img
        key={sources[index]}
        src={sources[index]}
        alt=""
        draggable={false}
        onClick={(event) => { event.stopPropagation(); swiped.current = false; }}
        className="memo-viewer-img max-h-[78%] max-w-[92%] rounded-[18px] object-contain shadow-[0_30px_80px_-20px_rgba(0,0,0,0.8)]"
      />
      <button
        type="button"
        aria-label={t('mylessons.review.close')}
        onClick={() => onIndex(null)}
        className="absolute right-5 top-[calc(1.25rem+env(safe-area-inset-top,0px))] flex h-10 w-10 items-center justify-center rounded-full bg-white/12 text-white"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" className="h-[18px] w-[18px]">
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      </button>
      {onRemove && (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onRemove(index);
            onIndex(count > 1 ? Math.min(index, count - 2) : null);
          }}
          className="absolute bottom-[calc(3.75rem+var(--safe-bottom))] left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full bg-white/12 px-4 py-2.5 text-[13px] font-bold text-white"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
            <path d="M4 7h16M9.5 7V5.2c0-.7.5-1.2 1.2-1.2h2.6c.7 0 1.2.5 1.2 1.2V7M6.5 7l.8 11.3c.1 1 .9 1.7 1.9 1.7h5.6c1 0 1.8-.7 1.9-1.7L17.5 7" />
          </svg>
          {t('mylessons.review.remove_photo')}
        </button>
      )}
      {count > 1 && (
        <div className="absolute inset-x-0 bottom-[calc(2rem+var(--safe-bottom))] flex justify-center gap-1.5" aria-hidden="true">
          {sources.map((src, i) => (
            <span key={src} className={`h-1.5 rounded-full transition-all duration-300 ${i === index ? 'w-5 bg-white' : 'w-1.5 bg-white/35'}`} />
          ))}
        </div>
      )}
    </div>,
    document.body,
  );
}
