// «Время студии» в шапке окон создания (новое занятие, запись у клетки,
// мастер записи на телефоне): переключатель «Занятие | Время студии». Слот в
// сетке можно занять двумя способами — занятием или временем без занятия
// (уборка, подготовка, планёрка), и переключатель говорит это одним взглядом,
// а одинокая кнопка «Время студии» оставляла вопрос, что она сделает.
//
// Нажатие: подложка переезжает на «Время студии» и окно меняется на своё —
// с тем же мастером, днём и временем. Окно получает переключатель готовым
// (проп headAction), чтобы самим окнам не знать про «Время студии» ничего,
// кроме места в шапке. На телефоне остаётся одна кнопка: двум сегментам рядом
// с заголовком там тесно.
import { useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { STUDIO_TIME_ICON as Icon } from '../studioTimeIcons';
import './studioTime.css';

/** Сколько подложка едет до смены окна (studioTime.css: .st-mode-thumb). */
const SWITCH_MS = 170;

export function StudioTimeButton({ onClick, current, disabled }: {
  onClick: () => void;
  /** Подпись того, что создаёт окно сейчас: «Занятие», «Запись». */
  current: string;
  disabled?: boolean;
}) {
  const { t } = useTranslation('journal');
  const [going, setGoing] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const currentRef = useRef<HTMLSpanElement>(null);
  const studioRef = useRef<HTMLButtonElement>(null);

  // Подложка встаёт под активный сегмент до первого кадра — иначе она
  // въезжала бы из угла при каждом открытии окна. Переменными прямо в DOM:
  // замер не повод перерисовывать переключатель второй раз.
  useLayoutEffect(() => {
    const el = going ? studioRef.current : currentRef.current;
    const box = boxRef.current;
    if (!el || !box) return;
    box.style.setProperty('--st-thumb-x', `${el.offsetLeft}px`);
    box.style.setProperty('--st-thumb-w', `${el.offsetWidth}px`);
  }, [going, current]);

  const go = () => {
    if (going) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce), (max-width: 767px)').matches) { onClick(); return; }
    setGoing(true);
    window.setTimeout(onClick, SWITCH_MS);
  };

  return (
    <div ref={boxRef} className={`st-mode${going ? ' is-going' : ''}`} role="tablist"
         aria-label={t('studioTime.modeLabel')} onMouseDown={e => e.stopPropagation()}>
      <span className="st-mode-thumb" aria-hidden />
      <span ref={currentRef} className="st-mode-current" role="tab" aria-selected={!going}>{current}</span>
      <button ref={studioRef} type="button" role="tab" aria-selected={going} className="st-mode-studio"
              onClick={go} disabled={disabled} title={t('studioTime.actionHint')} aria-label={t('studioTime.action')}>
        <span className="st-mode-icon" aria-hidden><Icon size={13} strokeWidth={2.1} /></span>
        <span className="st-mode-label">{t('studioTime.action')}</span>
      </button>
    </div>
  );
}
