// Кто ведёт: лента аватаров в цветах мастеров — замена тренера в один тап.
// В недельном виде и на телефоне перетащить занятие в чужую колонку нельзя,
// и до этой ленты замену там было не сделать вовсе.
import { useEffect, useRef } from 'react';
import type { Trainer } from '../../../types';

interface Props {
  trainers: Trainer[];
  value: number;
  onChange: (id: number) => void;
}

export function TrainerStrip({ trainers, value, onChange }: Props) {
  const stripRef = useRef<HTMLDivElement>(null);

  // Выбранный — в поле зрения с первого кадра, даже если он двенадцатый.
  useEffect(() => {
    const strip = stripRef.current;
    const active = strip?.querySelector<HTMLElement>('.is-selected');
    if (strip && active) strip.scrollLeft = active.offsetLeft - (strip.clientWidth - active.offsetWidth) / 2;
    // Только при открытии: выбор пальцем ленту не дёргает.
  }, []);

  // Колесо мыши листает ленту вбок. Без этого длинный список на десктопе
  // прокручивался только тачпадом или Shift+колесо.
  useEffect(() => {
    const strip = stripRef.current;
    if (!strip) return;
    const onWheel = (e: WheelEvent) => {
      if (strip.scrollWidth <= strip.clientWidth || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      e.preventDefault();
      strip.scrollLeft += e.deltaY;
    };
    strip.addEventListener('wheel', onWheel, { passive: false });
    return () => strip.removeEventListener('wheel', onWheel);
  }, []);

  return (
    <div className="le-trainers" ref={stripRef}>
      {trainers.map(trainer => {
        const selected = trainer.id === value;
        return (
          <button key={trainer.id} type="button"
                  className={`le-trainer${selected ? ' is-selected' : ''}`}
                  aria-pressed={selected}
                  title={trainer.full}
                  style={{ '--t-color': trainer.color, '--t-bg': trainer.bg } as React.CSSProperties}
                  onClick={() => onChange(trainer.id)}>
            <span className="le-trainer-av">{trainer.initials}</span>
            <span className="le-trainer-name">{trainer.name}</span>
          </button>
        );
      })}
    </div>
  );
}
