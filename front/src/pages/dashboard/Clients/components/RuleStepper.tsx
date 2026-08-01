import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { SegmentRules } from '../../../../api/clients/clients.types';

export interface RuleField {
  key: keyof SegmentRules;
  unit: 'days' | 'money' | 'visits';
  step: number;
  min: number;
  max: number;
}

interface RuleStepperProps {
  field: RuleField;
  value: number;
  disabled?: boolean;
  onCommit: (key: keyof SegmentRules, value: number) => void;
}

const SAVE_DEBOUNCE_MS = 700;

/**
 * Компактный степпер порога: −/+ и поле для прямого ввода. Значение уезжает на
 * сервер с задержкой, чтобы серия кликов по «+» не породила серию запросов;
 * во время ввода поле держит «сырую» строку, иначе нельзя стереть последнюю цифру.
 */
export function RuleStepper({ field, value, disabled, onCommit }: RuleStepperProps) {
  const { t } = useTranslation('clients');
  const [draft, setDraft] = useState(String(value));
  const [saved, setSaved] = useState(false);
  const dirtyRef = useRef(false);

  // Значение пришло извне (первая загрузка, откат после ошибки) — синхронизируем,
  // но не затираем то, что пользователь прямо сейчас правит.
  useEffect(() => {
    if (!dirtyRef.current) setDraft(String(value));
  }, [value]);

  const clamp = (n: number) => Math.min(Math.max(n, field.min), field.max);

  useEffect(() => {
    if (!dirtyRef.current) return;
    const parsed = Number(draft);
    if (draft.trim() === '' || Number.isNaN(parsed)) return;
    const next = clamp(Math.round(parsed));
    const id = setTimeout(() => {
      dirtyRef.current = false;
      if (next !== value) {
        onCommit(field.key, next);
        setSaved(true);
        setTimeout(() => setSaved(false), 1400);
      }
      setDraft(String(next));
    }, SAVE_DEBOUNCE_MS);
    return () => clearTimeout(id);
    // onCommit пересоздаётся родителем на каждый рендер — в зависимостях ему делать нечего
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, value, field.key, field.min, field.max]);

  const bump = (delta: number) => {
    if (disabled) return;
    dirtyRef.current = true;
    setDraft(String(clamp((Number(draft) || 0) + delta)));
  };

  return (
    <span className="fg-rule">
      <span className="fg-rule-label">{t(`filtersGuide.rule.${field.key}`)}</span>
      <span className={`fg-step${disabled ? ' is-off' : ''}`}>
        <button type="button" onClick={() => bump(-field.step)} disabled={disabled} aria-label="−">
          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round">
            <line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
        </button>
        <input
          inputMode="numeric"
          value={draft}
          disabled={disabled}
          onChange={e => { dirtyRef.current = true; setDraft(e.target.value.replace(/[^\d]/g, '')); }}
          onBlur={() => { if (draft.trim() === '') { dirtyRef.current = false; setDraft(String(value)); } }}
          style={{ width: field.unit === 'money' ? 62 : 38 }}
        />
        <button type="button" onClick={() => bump(field.step)} disabled={disabled} aria-label="+">
          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
        </button>
      </span>
      <span className="fg-unit">{t(`filtersGuide.unit.${field.unit}`)}</span>
      <span className={`fg-saved${saved ? ' on' : ''}`} aria-hidden={!saved}>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
      </span>
    </span>
  );
}
