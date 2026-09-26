import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { StaffService } from '../../../../api/staff/staff.types';
import { formatMoney } from '../../../../lib/money';
import { useDurationLabel } from '../../../../hooks/useDurationLabel';

type Field = 'price' | 'duration';

/** Потолки — как в ServicePricePicker: длиннее значение ушло бы на сервер ради отказа. */
const MAX_DIGITS: Record<Field, number> = { price: 9, duration: 4 };
const MAX_DURATION = 1440;

export interface StaffServiceTermsProps {
  services: StaffService[];
  currency?: string;
  /** Записать своё значение одной услуги. `null` — вернуть значение Каталога. */
  onSave: (service: StaffService, field: Field, value: number | null) => Promise<void>;
}

/**
 * Услуги сотрудника с его ценой и временем — и правка прямо в строке.
 *
 * Персиковая плашка — значение, заданное этому мастеру руками; серая —
 * унаследованное из Каталога: оно поедет за правкой услуги, своё — нет.
 * Нажатие на плашку открывает поле: новое число становится своим, пустое поле
 * возвращает значение Каталога. Правила разбора — те же, что в
 * ServicePricePicker (модалка сотрудника), чтобы на соседних экранах они не
 * разошлись.
 */
export function StaffServiceTerms({ services, currency, onSave }: StaffServiceTermsProps) {
  const { t } = useTranslation('common');
  const durationLabel = useDurationLabel();
  const [editing, setEditing] = useState<{ id: number; field: Field } | null>(null);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  // Esc снимает поле, и уходящий фокус успевает позвать `commit` — без флага
  // отмена сохраняла бы ровно то, от чего человек отказался.
  const cancelled = useRef(false);

  useEffect(() => {
    if (editing !== null) inputRef.current?.select();
  }, [editing]);

  function startEdit(svc: StaffService, field: Field) {
    if (saving) return;
    cancelled.current = false;
    setError(null);
    setEditing({ id: svc.id, field });
    setDraft(String(field === 'price' ? svc.price : svc.duration_min));
  }

  async function commit(svc: StaffService, field: Field) {
    if (cancelled.current) { cancelled.current = false; setEditing(null); return; }
    setEditing(null);
    // Минуты — целое число: «-45» и «1.5» нельзя превращать в 45 и 15.
    const cleaned = field === 'duration' ? draft.trim() : draft.replace(/[^\d]/g, '');
    const parsed = cleaned === '' ? null : Number(cleaned);
    if (field === 'duration' && parsed !== null
      && (!/^\d+$/.test(cleaned) || parsed < 1 || parsed > MAX_DURATION)) {
      setError(`${svc.name}: ${t('servicePrice.durationInvalid', { max: MAX_DURATION })}`);
      return;
    }
    const custom = field === 'price' ? svc.price_custom : svc.duration_custom;
    const current = field === 'price' ? svc.price : svc.duration_min;
    // Ничего не поменяли — ничего не пишем. Пустое поле у унаследованного
    // значения — тоже «ничего»: оно и так из Каталога.
    if (parsed === current || (parsed === null && !custom)) return;
    setSaving(true);
    try {
      await onSave(svc, field, parsed);
    } finally {
      setSaving(false);
    }
  }

  function cell(svc: StaffService, field: Field) {
    const isPrice = field === 'price';
    const custom = isPrice ? svc.price_custom : svc.duration_custom;
    if (editing?.id === svc.id && editing.field === field) {
      return (
        <input
          ref={inputRef}
          className="staff-svc-price-v staff-svc-price-input v-svc-price-input"
          value={draft}
          inputMode="numeric"
          maxLength={MAX_DIGITS[field]}
          autoFocus
          aria-label={t(isPrice ? 'servicePrice.aria' : 'servicePrice.durationAria',
            { service: svc.name })}
          onChange={e => setDraft(e.target.value)}
          onBlur={() => { void commit(svc, field); }}
          onKeyDown={e => {
            if (e.key === 'Enter') { e.preventDefault(); inputRef.current?.blur(); }
            if (e.key === 'Escape') { cancelled.current = true; inputRef.current?.blur(); }
          }}
          style={{ width: `calc(${Math.max(draft.length, 3)}ch + 22px)` }}
        />
      );
    }
    return (
      <button
        type="button"
        className={`staff-svc-price-v ${custom ? 'custom' : ''}`}
        disabled={saving}
        onClick={() => startEdit(svc, field)}
        title={t(isPrice
          ? (custom ? 'servicePrice.custom' : 'servicePrice.inherited')
          : (custom ? 'servicePrice.durationCustom' : 'servicePrice.durationInherited'))}
      >
        {isPrice ? formatMoney(svc.price, currency) : durationLabel(svc.duration_min)}
      </button>
    );
  }

  return (
    <div className="staff-svc-prices">
      {services.map(svc => (
        <div key={svc.id} className="staff-svc-price">
          <span className="staff-svc-price-name">{svc.name}</span>
          {cell(svc, 'price')}
          {cell(svc, 'duration')}
        </div>
      ))}
      {error && <div role="alert" className="staff-svc-price-error">{error}</div>}
      <div className="staff-svc-price-hint">{t('servicePrice.hint')}</div>
    </div>
  );
}
