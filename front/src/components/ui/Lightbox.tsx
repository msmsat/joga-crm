import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { photoLayoutId } from './photoLayoutId';

export interface LightboxProps {
  /** Готовые к показу адреса (вызывающий код уже прогнал их через resolveImageUrl). */
  photos: string[];
  /** Открытый кадр; null — просмотр закрыт. */
  index: number | null;
  onIndex: (index: number | null) => void;
  /** Этаж выше базовых модалок (1000). Поднимать, если просмотр открывается со своего слоя. */
  zIndex?: number;
}

const IconClose = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
  </svg>
);

const IconChevron = ({ left }: { left?: boolean }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
       style={left ? { transform: 'rotate(180deg)' } : undefined}>
    <polyline points="9 18 15 12 9 6"/>
  </svg>
);

const glass: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: 'rgba(255,255,255,0.10)', border: '1px solid rgba(255,255,255,0.16)',
  backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
  color: '#fff', cursor: 'pointer', padding: 0,
  fontFamily: 'Manrope, sans-serif', transition: 'background 0.18s ease',
};

/**
 * Полноэкранный просмотр снимков: кадр разворачивается из своей миниатюры,
 * листается стрелками, клавишами и плёнкой внизу.
 *
 * Фон — тёплый графит, а не чёрный: снимки здесь почти всегда живые (кожа,
 * волосы, бумага справки), и холодный чёрный уводит их в синеву.
 *
 * Своё затемнение, а не `.v-overlay` кита: на телефоне тот превращается в шит
 * снизу — верная раскладка для формы и заведомо неверная для фотографии.
 */
export function Lightbox({ photos, index, onIndex, zIndex }: LightboxProps) {
  const floor = zIndex ?? 2000;
  const { t } = useTranslation('common');
  const still = useReducedMotion();
  const open = index != null && index >= 0 && index < photos.length;
  const current = open ? photos[index] : null;

  const go = (step: number) => {
    if (index == null || photos.length < 2) return;
    onIndex((index + step + photos.length) % photos.length);
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onIndex(null);
      if (e.key === 'ArrowRight') go(1);
      if (e.key === 'ArrowLeft') go(-1);
    };
    window.addEventListener('keydown', onKey);
    // Страница под просмотром не должна уезжать колесом.
    const scroll = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = scroll;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, index, photos.length]);

  // Соседние кадры подгружаются заранее — листание идёт без белой вспышки.
  useEffect(() => {
    if (index == null) return;
    for (const step of [1, -1]) {
      const src = photos[(index + step + photos.length) % photos.length];
      if (src) new Image().src = src;
    }
  }, [index, photos]);

  const strip = open && photos.length > 1;

  return createPortal(
    <AnimatePresence>
      {open && current && (
        <motion.div
          key="lightbox"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          onClick={() => onIndex(null)}
          style={{
            position: 'fixed', inset: 0, zIndex: floor,
            background: 'rgba(28,22,20,0.94)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            padding: `16px 16px calc(16px + env(safe-area-inset-bottom))`,
            boxSizing: 'border-box',
          }}
        >
          {/* Счётчик и закрытие — одной строкой поверх кадра */}
          <div style={{ position: 'absolute', top: 'calc(14px + env(safe-area-inset-top))', left: '16px', right: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', pointerEvents: 'none' }}>
            {photos.length > 1 ? (
              <div
                aria-label={t('lightbox.counter', { current: index + 1, total: photos.length })}
                style={{ ...glass, cursor: 'default', height: '32px', padding: '0 12px', borderRadius: '999px', fontSize: '12px', fontWeight: 700, letterSpacing: '0.3px', fontVariantNumeric: 'tabular-nums' }}
              >{index + 1} / {photos.length}</div>
            ) : <span/>}
            <button
              type="button"
              onClick={e => { e.stopPropagation(); onIndex(null); }}
              aria-label={t('lightbox.close')}
              style={{ ...glass, pointerEvents: 'auto', width: '36px', height: '36px', borderRadius: '12px' }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.20)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.10)'; }}
            ><IconClose/></button>
          </div>

          {photos.length > 1 && ([-1, 1] as const).map(step => (
            <button
              key={step}
              type="button"
              onClick={e => { e.stopPropagation(); go(step); }}
              aria-label={t(step < 0 ? 'lightbox.prev' : 'lightbox.next')}
              style={{
                ...glass, position: 'absolute', top: '50%', transform: 'translateY(-50%)',
                [step < 0 ? 'left' : 'right']: '16px',
                width: '44px', height: '44px', borderRadius: '14px', zIndex: 1,
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.20)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.10)'; }}
            ><IconChevron left={step < 0}/></button>
          ))}

          <motion.img
            key={current}
            layoutId={still ? undefined : photoLayoutId(current)}
            src={current}
            alt=""
            onClick={e => e.stopPropagation()}
            drag={photos.length > 1 ? 'x' : false}
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.14}
            onDragEnd={(_, info) => { if (Math.abs(info.offset.x) > 70) go(info.offset.x < 0 ? 1 : -1); }}
            transition={{ type: 'spring', stiffness: 320, damping: 34 }}
            style={{
              maxWidth: 'min(1180px, calc(100% - 96px))',
              maxHeight: strip ? 'calc(100dvh - 190px)' : 'calc(100dvh - 104px)',
              objectFit: 'contain', borderRadius: '8px', display: 'block',
              boxShadow: '0 30px 90px rgba(0,0,0,0.55)',
              cursor: photos.length > 1 ? 'grab' : 'default',
            }}
          />

          {strip && (
            <div
              onClick={e => e.stopPropagation()}
              style={{ display: 'flex', gap: '8px', marginTop: '18px', maxWidth: '100%', overflowX: 'auto', padding: '2px 2px 4px', scrollbarWidth: 'none' }}
            >
              {photos.map((src, i) => (
                <button
                  key={src}
                  type="button"
                  onClick={() => onIndex(i)}
                  style={{
                    flex: '0 0 auto', width: '52px', height: '52px', padding: 0, cursor: 'pointer',
                    borderRadius: '10px', overflow: 'hidden', background: 'none',
                    border: i === index ? '2px solid var(--peach, #F9A08B)' : '2px solid transparent',
                    opacity: i === index ? 1 : 0.45, transition: 'opacity 0.18s ease',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.opacity = '1'; }}
                  onMouseLeave={e => { e.currentTarget.style.opacity = i === index ? '1' : '0.45'; }}
                >
                  <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}/>
                </button>
              ))}
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
