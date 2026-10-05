import { useId, useLayoutEffect, useRef, useState } from 'react';

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  icon?: React.ReactNode;
}

export interface SegmentedProps<T extends string> {
  label?: string;
  value: T;
  options: SegmentedOption<T>[];
  onChange: (v: T) => void;
  /** Значение продиктовано другим полем — переключать нечего. */
  disabled?: boolean;
  /** Имя группы для экранного диктора, когда видимой подписи `label` нет. */
  ariaLabel?: string;
  id?: string;
  panelId?: string;
  appearance?: 'pill' | 'line';
  /**
   * Сегменты делят ширину по длине подписей, а не поровну: короткое «Все»
   * отдаёт место длинным «Оплатам». Для 4 значений в узкой панели, где равные
   * доли обрезали подпись на половине языков.
   */
  fit?: boolean;
}

// Переключатель из 2–4 взаимоисключающих значений: белая «таблетка» едет под
// активным сегментом. Замена дропдауна там, где вариантов мало и их видно все
// сразу (тип услуги: групповая/индивидуальная; вкладки ленты клиента).
export function Segmented<T extends string>({ label, value, options, onChange, disabled, ariaLabel, fit, id, panelId, appearance = 'pill' }: SegmentedProps<T>) {
  const generatedId = useId();
  const groupId = id ?? generatedId;
  const idx = Math.max(0, options.findIndex(o => o.value === value));
  const w = 100 / options.length;
  const row = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{ left: number; width: number } | null>(null);
  // Замер повторяем, когда меняются сами подписи, а не на каждый новый массив опций.
  const labelsKey = options.map(o => o.label).join('|');

  // В режиме fit доли разные — таблетку ставим по замеру кнопки. До отрисовки
  // кадра (layout effect), иначе первый кадр показал бы её не под той вкладкой.
  useLayoutEffect(() => {
    const el = row.current;
    if (!fit || !el || appearance === 'line') return;
    const buttons = Array.from(el.querySelectorAll<HTMLElement>('.vk-seg-btn'));
    const measure = () => {
      const b = buttons[idx];
      if (!b) return;
      setBox(prev => prev?.left === b.offsetLeft && prev.width === b.offsetWidth ? prev : { left: b.offsetLeft, width: b.offsetWidth });
    };
    // Доли меняются и без смены ширины ряда (догрузился шрифт, сменился язык).
    const observer = new ResizeObserver(measure);
    buttons.forEach(b => observer.observe(b));
    return () => observer.disconnect();
  }, [fit, idx, labelsKey, appearance]);

  const thumb = fit && box
    ? { width: `${box.width}px`, left: `${box.left}px` }
    : { width: `calc(${w}% - 6px)`, left: `calc(${idx * w}% + 3px)` };

  return (
    <div>
      {label && <label className="vk-label">{label}</label>}
      <div id={groupId} ref={row} className={`vk-seg${fit ? ' vk-seg--fit' : ''}${appearance === 'line' ? ' vk-seg--line' : ''}`} role="tablist" aria-label={ariaLabel ?? label}>
        {appearance === 'pill' && <span className="vk-seg-thumb" aria-hidden="true" style={thumb} />}
        {options.map(o => (
          <button
            key={o.value}
            type="button"
            role="tab"
            id={`${groupId}-${o.value}`}
            aria-controls={panelId}
            aria-selected={o.value === value}
            tabIndex={o.value === value ? 0 : -1}
            disabled={disabled}
            onClick={() => onChange(o.value)}
            onKeyDown={event => {
              const direction = getComputedStyle(event.currentTarget).direction === 'rtl' ? -1 : 1;
              const step = event.key === 'ArrowRight' ? direction : event.key === 'ArrowLeft' ? -direction : 0;
              const next = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1
                : step ? (idx + step + options.length) % options.length : null;
              if (next === null) return;
              event.preventDefault();
              onChange(options[next].value);
              row.current?.querySelectorAll<HTMLButtonElement>('.vk-seg-btn')[next]?.focus();
            }}
            title={o.label}
            className={`vk-seg-btn${o.value === value ? ' is-on' : ''}`}
          >
            {o.icon}
            <span className="vk-seg-text">{o.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
