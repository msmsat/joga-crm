import { useId, useState } from 'react';

export interface InputProps {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;           // для пометки поля «тронутым» (валидация V3-3)
  placeholder?: string;
  type?: string;
  error?: string;                // текст ошибки → красная рамка + подпись (валидация V3-3)
  disabled?: boolean;
  monospace?: boolean;           // для токенов/ключей — моноширинный шрифт читается однозначнее
  min?: number;                  // для type="number" — нативные ограничения ввода
  max?: number;
  step?: number;
  icon?: React.ReactNode;        // иконка слева (например, поиск)
  rows?: number;                 // >0 → многострочное поле (описание) вместо input
  suffix?: string;               // единица измерения справа в поле (мин, м², ₽)
  onEnter?: () => void;          // Enter в однострочном поле — «Применить» рядом (промокод, ваучер)
  autoFocus?: boolean;           // поле, которое раскрыли кнопкой: печатать сразу, без второго клика
  inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode']; // 'numeric' — цифровая клавиатура телефона без type="number"
  optional?: string;             // метка «Необязательно» рядом с подписью — видно, что поле можно пропустить
  required?: string;             // метка «Обязательно» — персиковая точка; с `done` — фисташковая с галочкой
  done?: boolean;                // обязательное поле уже заполнено так, что форму можно сохранить
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: '11px', fontWeight: 700,
  color: 'var(--text3)', letterSpacing: '0.6px', textTransform: 'uppercase', marginBottom: '7px',
};

const CHECK = (
  <svg width="8" height="8" viewBox="0 0 10 8" fill="none" aria-hidden="true">
    <path d="M1 4L3.5 6.5L9 1" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export interface FieldLabelProps {
  label: string;
  /** Поле, к которому относится подпись. Нет — подпись группы (плитки, календарь): тогда `id` для aria-labelledby. */
  htmlFor?: string;
  id?: string;
  optional?: string;
  required?: string;
  done?: boolean;
}

/**
 * Подпись поля с пометкой «Обязательно» / «Необязательно» — та же, что у Input,
 * для полей, которые не Input: сегменты, плитки, календарь, списки выбора.
 * Заполненное обязательное поле (`done`) перекрашивается в фисташковый и
 * получает галочку — видно, что именно ещё держит кнопку сохранения.
 */
export function FieldLabel({ label, htmlFor, id, optional, required, done }: FieldLabelProps) {
  const Tag = htmlFor ? 'label' : 'span';
  const tag = required ?? optional;
  if (!tag) return <Tag id={id} htmlFor={htmlFor} style={labelStyle}>{label}</Tag>;
  return (
    <div className="v-field-head">
      <Tag id={id} htmlFor={htmlFor} style={{ ...labelStyle, marginBottom: 0 }}>{label}</Tag>
      <span className={`v-field-tag${required ? ' is-required' : ''}${required && done ? ' is-done' : ''}`}>
        {required && done && <span className="v-field-tag-check">{CHECK}</span>}
        {tag}
      </span>
    </div>
  );
}

// Поле ввода кита: label + glow-фокус (эталон FocusInput) + состояние ошибки.
// Класс v-input — кегль 16px на телефоне (App.css): мельче iOS приближает
// страницу при фокусе, в Safari и во встроенных браузерах Instagram/Telegram.
export function Input({ label, value, onChange, onBlur, placeholder, type = 'text', error, disabled, monospace, min, max, step, icon, rows, suffix, onEnter, autoFocus, inputMode, optional, required, done }: InputProps) {
  const fieldId = useId();
  const [focused, setFocused] = useState(false);
  const borderColor = error ? '#D88C9A' : focused ? '#FCAE91' : 'rgba(var(--ink),0.09)';

  const fieldStyle: React.CSSProperties = {
    width: '100%',
    padding: `12px ${suffix ? '44px' : '15px'} 12px ${icon ? '38px' : '15px'}`,
    background: focused ? 'var(--bg-card, #fff)' : 'rgba(var(--ink),0.025)',
    border: `1.5px solid ${borderColor}`,
    borderRadius: '12px', fontSize: '14px', fontWeight: 500, color: 'var(--text, #1A1A1A)',
    outline: 'none', fontFamily: monospace ? "'SF Mono', 'Consolas', monospace" : 'Manrope, sans-serif',
    boxShadow: error ? '0 0 0 3px rgba(216,140,154,0.12)' : focused ? '0 0 0 3px rgba(252,174,145,0.14)' : 'none',
    transition: 'all 0.18s ease', boxSizing: 'border-box',
    opacity: disabled ? 0.6 : 1,
  };

  const shared = {
    id: fieldId,
    className: 'v-input',
    value,
    placeholder,
    disabled,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange(e.target.value),
    onFocus: () => setFocused(true),
    onBlur: () => { setFocused(false); onBlur?.(); },
  };

  return (
    <div>
      {label && <FieldLabel label={label} htmlFor={fieldId} optional={optional} required={required} done={done} />}
      <div style={{ position: 'relative' }}>
        {icon && (
          <span style={{
            position: 'absolute', left: '13px', top: '50%', transform: 'translateY(-50%)',
            display: 'flex', color: 'var(--text3, #999)', pointerEvents: 'none',
          }}>
            {icon}
          </span>
        )}
        {rows ? (
          <textarea {...shared} rows={rows} style={{ ...fieldStyle, resize: 'none', lineHeight: 1.5, display: 'block' }} />
        ) : (
          <input {...shared} type={type} min={min} max={max} step={step} style={fieldStyle} autoFocus={autoFocus}
                 inputMode={inputMode}
                 onKeyDown={onEnter ? e => {
                   // Enter не должен отправить окружающую форму и закрыть окно:
                   // здесь он значит «применить это поле», а не «сохранить всё».
                   if (e.key === 'Enter') { e.preventDefault(); onEnter(); }
                 } : undefined} />
        )}
        {suffix && (
          <span style={{
            position: 'absolute', right: '14px', top: rows ? '14px' : '50%',
            transform: rows ? 'none' : 'translateY(-50%)',
            fontSize: '12px', fontWeight: 700, color: 'var(--text3, #AAA)', pointerEvents: 'none',
          }}>
            {suffix}
          </span>
        )}
      </div>
      {error && <div style={{ fontSize: '11.5px', color: '#D88C9A', fontWeight: 600, marginTop: '6px' }}>{error}</div>}
    </div>
  );
}
