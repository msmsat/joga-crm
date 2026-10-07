import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion } from 'framer-motion';
import { History } from 'lucide-react';
import { PastLessonsList } from './PastLessonsList';
import { usePastLessons } from './usePastLessons';
import './pastLessons.css';

const WIDTH = 344;
const GAP = 8;   // просвет между кнопкой и поповером
const PAD = 8;   // не прижимать поповер к краю экрана

interface Spot { left: number; top?: number; bottom?: number; maxHeight: number; up: boolean }

/** Поповер — под кнопкой и правым краем к ней, как выпадающий список поля;
 *  снизу тесно — над ней. Высота режется по свободному месту, лента внутри
 *  листается. */
function place(anchor: DOMRect): Spot {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const width = Math.min(WIDTH, vw - PAD * 2);
  const left = Math.min(Math.max(anchor.right - width, PAD), vw - width - PAD);
  const below = vh - anchor.bottom - GAP - PAD;
  const above = anchor.top - GAP - PAD;
  const up = below < 300 && above > below;
  return up
    ? { left, bottom: vh - anchor.top + GAP, maxHeight: Math.min(440, above), up }
    : { left, top: anchor.bottom + GAP, maxHeight: Math.min(440, below), up };
}

/**
 * Кнопка справа от выбранного клиента: «сколько раз был» цифрой и по нажатию —
 * его прошлые занятия поповером поверх формы. Места в форме не занимает: окно
 * записи не растёт и не прыгает, история — слоем над ним.
 *
 * История грузится сразу, как клиент выбран: к нажатию она уже на месте, а
 * цифра на кнопке появляется без отдельного запроса.
 */
export function PastLessonsButton({ clientId, layer = 1250, disabled = false }: {
  clientId: number;
  /** Этаж поповера: над окном записи (210) и списками кита (1200). */
  layer?: number;
  disabled?: boolean;
}) {
  const { t } = useTranslation(['journal']);
  const { visits, isPending } = usePastLessons(clientId);
  const [open, setOpen] = useState(false);
  const [spot, setSpot] = useState<Spot | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Место считается до отрисовки и заново на каждой прокрутке (окно записи
  // листается само) и смене размера.
  useLayoutEffect(() => {
    if (!open) return;
    const recalc = () => { if (buttonRef.current) setSpot(place(buttonRef.current.getBoundingClientRect())); };
    // Листается сама лента поповера — кнопка не сдвинулась, считать нечего.
    const onScroll = (e: Event) => { if (!panelRef.current?.contains(e.target as Node)) recalc(); };
    recalc();
    window.addEventListener('scroll', onScroll, { passive: true, capture: true });
    window.addEventListener('resize', recalc, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', recalc);
    };
  }, [open]);

  // Клик мимо и Esc закрывают только поповер. Esc ловится на захвате: окно
  // записи слушает его на window и закрылось бы целиком вместе с выбранным.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (buttonRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopImmediatePropagation();
      setOpen(false);
      buttonRef.current?.focus();
    };
    document.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  // Другой клиент — другая история: открытый поповер прошлого не остаётся.
  const [shownFor, setShownFor] = useState(clientId);
  if (shownFor !== clientId) {
    setShownFor(clientId);
    setOpen(false);
  }

  const title = t('journal:pastLessons.title');
  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className={`plh-btn${open ? ' is-open' : ''}`}
        aria-expanded={open}
        aria-label={title}
        title={title}
        disabled={disabled}
        onClick={() => setOpen(v => !v)}
      >
        <History className="plh-btn-icon" size={16} strokeWidth={2.2} />
        <AnimatePresence initial={false}>
          {!isPending && visits > 0 && (
            <motion.span
              key="count"
              className="plh-btn-count"
              initial={{ opacity: 0, width: 0 }}
              animate={{ opacity: 1, width: 'auto' }}
              exit={{ opacity: 0, width: 0 }}
              transition={{ duration: 0.2, ease: [0.2, 0.8, 0.2, 1] }}
            >
              {visits}
            </motion.span>
          )}
        </AnimatePresence>
      </button>

      {createPortal(
        <AnimatePresence>
          {open && spot && (
            <motion.div
              ref={panelRef}
              className="plh-pop"
              role="dialog"
              aria-label={title}
              style={{
                left: spot.left, top: spot.top, bottom: spot.bottom,
                maxHeight: spot.maxHeight, width: Math.min(WIDTH, window.innerWidth - PAD * 2), zIndex: layer,
                transformOrigin: spot.up ? 'bottom right' : 'top right',
              }}
              initial={{ opacity: 0, y: spot.up ? 6 : -6, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: spot.up ? 4 : -4, scale: 0.98 }}
              transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
              // Окна журнала закрываются нажатием мимо себя; React-события из
              // портала всплывают по дереву компонентов — до окна они не доходят.
              onMouseDown={e => e.stopPropagation()}
              onClick={e => e.stopPropagation()}
            >
              <PastLessonsList clientId={clientId} />
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  );
}

/**
 * Та же история в строке списка (мастер записи): маленькая капсула справа от
 * клиента. Сама строка — кнопка выбора, поэтому капсула стоит рядом, а не в ней;
 * лента раскрывается под строкой (`PastLessonsList inline`).
 */
export function PastLessonsToggle({ open, count, onToggle }: { open: boolean; count: number; onToggle: () => void }) {
  const { t } = useTranslation(['journal']);
  const title = t('journal:pastLessons.title');
  return (
    <button
      type="button"
      className={`plh-toggle${open ? ' is-open' : ''}`}
      aria-expanded={open}
      aria-label={title}
      title={title}
      onClick={onToggle}
    >
      <History size={14} strokeWidth={2.2} />
      {count > 0 && <span>{count}</span>}
    </button>
  );
}
