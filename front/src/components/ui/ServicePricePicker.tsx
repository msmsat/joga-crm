import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';

import { formatMoney } from '../../lib/money';
import { useDurationLabel } from '../../hooks/useDurationLabel';

/** Услуга, какой её показывает этот список. Ровно то, что нужно, — не ServiceRead:
 *  компонент кита не должен зависеть от формы ответа одной ручки. */
export interface PickableService {
  id: number;
  name: string;
  /** Цена в Каталоге. Она же — стартовая сумма в рамке. */
  price: number;
  /** Длительность в Каталоге, минуты. Она же — стартовое время в рамке. */
  duration_min: number;
}

export interface ServicePriceSelection {
  ids: number[];
  /** Только СВОИ цены мастера. Нет ключа — «как в Каталоге»: такая цена поедет
   *  за правкой Каталога, а записанная — нет, и разница эта видимая. */
  prices: Record<number, number>;
  /** Только СВОЁ время мастера, минуты. Правило то же, что у цены. */
  durations: Record<number, number>;
}

export interface ServicePricePickerProps {
  services: PickableService[];
  value: ServicePriceSelection;
  onChange: (next: ServicePriceSelection) => void;
  /** Код валюты студии. Не передали — знак не рисуется. */
  currency?: string;
  disabled?: boolean;
}

type Field = 'price' | 'duration';

/** Потолки полей — ниже серверных (MAX_STAFF_SERVICE_PRICE — миллиард; время —
 *  сутки): длиннее значение ушло бы на сервер ради отказа. */
const MAX_DIGITS: Record<Field, number> = { price: 9, duration: 4 };
const MAX_DURATION = 1440;

const PEACH = 'linear-gradient(135deg, var(--peach-light) 0%, var(--peach) 100%)';
const FONT = 'Manrope, sans-serif';

/**
 * «Чем занимается сотрудник», «сколько это у него стоит» и «сколько длится» —
 * одним списком.
 *
 * Пилюля включает услугу, справа от названия — цена, справа от цены — время.
 * Изначально там стоят цена и длительность Каталога, и пока их не трогали,
 * они именно наследуются: поднимут ценник или удлинят услугу — поменяется и
 * здесь. Стоит ввести своё значение, и связь рвётся осознанно, поэтому своё
 * выглядит иначе, чем доставшееся.
 *
 * Пустое поле возвращает значение Каталога. Ноль у цены — законная цена
 * («бесплатно у стажёра»); у времени ноля не бывает, он тоже возвращает
 * Каталог: услуга без длительности не занимает времени мастера.
 *
 * Один компонент на создание и на редактирование сотрудника: две копии этого
 * списка разошлись бы на первой правке, и владелец увидел бы разные правила на
 * соседних экранах.
 */
export function ServicePricePicker({
  services, value, onChange, currency, disabled,
}: ServicePricePickerProps) {
  const { t } = useTranslation('common');
  const durationLabel = useDurationLabel();
  const [editing, setEditing] = useState<{ id: number; field: Field } | null>(null);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  // Esc снимает поле с экрана, и уходящий фокус успевает позвать `commit` —
  // отмена сохраняла бы ровно то, от чего человек отказался. Флаг, а не
  // состояние: решение нужно ПРЯМО в обработчике blur, до следующего рендера.
  const cancelled = useRef(false);

  useEffect(() => {
    if (editing !== null) inputRef.current?.select();
  }, [editing]);

  function toggle(service: PickableService) {
    if (disabled) return;
    const on = value.ids.includes(service.id);
    const prices = { ...value.prices };
    const durations = { ...value.durations };
    // Сняли услугу — своя цена и своё время уходят вместе с ней. Оставить их
    // висеть значило бы вернуть надбавку молча при повторном назначении.
    if (on) { delete prices[service.id]; delete durations[service.id]; }
    onChange({
      ids: on ? value.ids.filter(id => id !== service.id) : [...value.ids, service.id],
      prices,
      durations,
    });
  }

  function startEdit(service: PickableService, field: Field) {
    if (disabled) return;
    cancelled.current = false;
    setEditing({ id: service.id, field });
    setDraft(String(field === 'price'
      ? value.prices[service.id] ?? service.price
      : value.durations[service.id] ?? service.duration_min));
  }

  function commit(service: PickableService, field: Field) {
    if (cancelled.current) { cancelled.current = false; setEditing(null); return; }
    const cleaned = draft.replace(/[^\d]/g, '');
    const parsed = cleaned === '' ? null : Number(cleaned);
    const base = field === 'price' ? service.price : service.duration_min;
    const own = { ...(field === 'price' ? value.prices : value.durations) };
    // Пусто — вернуть значение Каталога. Ровно то же, что в Каталоге, —
    // тоже наследование: владелец ничего не менял, и связь рвать не за что.
    // Время вне 1…1440 минут сервер отвергнет — возвращаем Каталог сразу.
    const invalid = field === 'duration' && parsed !== null
      && (parsed < 1 || parsed > MAX_DURATION);
    if (parsed === null || parsed === base || invalid) delete own[service.id];
    else own[service.id] = parsed;
    onChange(field === 'price'
      ? { ...value, prices: own }
      : { ...value, durations: own });
    setEditing(null);
  }

  function segment(service: PickableService, field: Field, custom: boolean, text: string) {
    const isPrice = field === 'price';
    // Цена лежит поверх времени и сохраняет выгнутый правый край: время
    // подложено под неё отрицательным отступом, и граница между ними — дуга,
    // а не прямой стык двух квадратов.
    const shape: CSSProperties = isPrice
      ? { position: 'relative', zIndex: 1, borderRadius: '0 20px 20px 0' }
      : { marginLeft: '-20px', paddingLeft: '30px' };
    if (editing?.id === service.id && editing.field === field) {
      return (
        <input
          ref={inputRef}
          className="v-svc-price-input"
          value={draft}
          inputMode="numeric"
          maxLength={MAX_DIGITS[field]}
          autoFocus
          aria-label={t(isPrice ? 'servicePrice.aria' : 'servicePrice.durationAria',
            { service: service.name })}
          onChange={e => setDraft(e.target.value)}
          onBlur={() => commit(service, field)}
          onKeyDown={e => {
            // stopPropagation обязателен: модалка сотрудника слушает
            // Enter на всём окне (`submitOnEnter`), и без него ввод
            // пролистывал бы шаг мастера вместо сохранения значения.
            if (e.key === 'Enter') {
              e.preventDefault(); e.stopPropagation(); commit(service, field);
            }
            // Esc отменяет правку, а не закрывает модалку: окно с
            // открытым полем закрылось бы, потеряв всю форму.
            if (e.key === 'Escape') {
              e.stopPropagation(); cancelled.current = true; setEditing(null);
            }
          }}
          style={{
            ...shape,
            // Поля прибавляем к ширине явно: у input `box-sizing:
            // border-box`, и «Nch» уходило под них — сумма 1400
            // показывалась как 400, причём молча.
            width: `calc(${Math.max(draft.length, 3)}ch + ${isPrice ? 24 : 44}px)`,
            padding: isPrice ? '8px 10px' : '8px 10px 8px 30px',
            border: 'none', outline: 'none', textAlign: 'center',
            background: PEACH, color: '#fff',
            fontSize: '12px', fontWeight: 800, fontFamily: FONT,
          }}
        />
      );
    }
    return (
      <button
        type="button"
        className={isPrice ? 'v-svc-price' : 'v-svc-duration'}
        disabled={disabled}
        onClick={() => startEdit(service, field)}
        title={t(isPrice
          ? (custom ? 'servicePrice.custom' : 'servicePrice.inherited')
          : (custom ? 'servicePrice.durationCustom' : 'servicePrice.durationInherited'))}
        style={{
          padding: '8px 12px', border: 'none', whiteSpace: 'nowrap',
          cursor: disabled ? 'not-allowed' : 'pointer',
          ...shape,
          // Своё значение — сплошной персик, как у любой кнопки действия в
          // продукте; доставшееся из Каталога — бледное. Цена и время
          // различаются подложкой: цена персиковая всегда, время — нейтральное,
          // иначе дуга между ними не читалась бы. Бледный персик цены —
          // НЕПРОЗРАЧНЫЙ (смесь с фоном карточки): полупрозрачный пропускал
          // бы сквозь дугу подложенное под неё время, и край исчезал.
          background: custom
            ? PEACH
            : isPrice
              ? 'color-mix(in srgb, #F9A08B 18%, var(--bg-card))'
              : 'rgba(var(--ink),0.05)',
          // Своё время лежит под своей ценой — дуге нужна тень, чтобы
          // отделиться от такого же персика.
          boxShadow: isPrice && custom ? '2px 0 4px rgba(0,0,0,0.08)' : undefined,
          color: custom ? '#fff' : 'var(--onyx)', fontSize: '12px',
          fontWeight: custom ? 800 : 600, fontFamily: FONT,
        }}
      >
        {text}
      </button>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
        {services.map(service => {
          const on = value.ids.includes(service.id);
          const ownPrice = value.prices[service.id];
          const ownDuration = value.durations[service.id];
          return (
            <div
              key={service.id}
              className="v-svc-row"
              style={{
                display: 'inline-flex', alignItems: 'stretch', borderRadius: '20px',
                // Включённая услуга — светлая пилюля с персиковой ценой, а не
                // сплошная тёмная заливка: акцент в продукте носит то, что
                // человек задал руками, а не название.
                border: on ? '1.5px solid var(--peach)' : '1.5px solid rgba(var(--ink),0.08)',
                background: on ? 'var(--bg-card)' : 'rgba(var(--ink),0.02)',
                overflow: 'hidden', transition: 'all 0.2s ease',
              }}
            >
              <button
                type="button"
                className="v-svc-name"
                disabled={disabled}
                aria-pressed={on}
                onClick={() => toggle(service)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '6px',
                  padding: '8px 12px 8px 14px', border: 'none', background: 'transparent',
                  cursor: disabled ? 'not-allowed' : 'pointer',
                  color: on ? 'var(--onyx)' : 'var(--muted)',
                  fontSize: '12px', fontWeight: on ? 700 : 600,
                  fontFamily: FONT, whiteSpace: 'nowrap',
                }}
              >
                {on && (
                  <svg width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                    <path d="M2 6L5 9L10 3" stroke="currentColor" strokeWidth="2"
                          strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                )}
                {service.name}
              </button>

              {on && segment(service, 'price', ownPrice !== undefined,
                formatMoney(ownPrice ?? service.price, currency))}
              {on && segment(service, 'duration', ownDuration !== undefined,
                durationLabel(ownDuration ?? service.duration_min))}
            </div>
          );
        })}
      </div>
      {value.ids.length > 0 && (
        <div style={{
          marginTop: '8px', fontSize: '11px', fontWeight: 600,
          color: 'var(--text3)', fontFamily: FONT,
        }}>
          {t('servicePrice.hint')}
        </div>
      )}
    </div>
  );
}
