import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { formatMoney } from '../../lib/money';

/** Услуга, какой её показывает этот список. Ровно то, что нужно, — не ServiceRead:
 *  компонент кита не должен зависеть от формы ответа одной ручки. */
export interface PickableService {
  id: number;
  name: string;
  /** Цена в Каталоге. Она же — стартовая сумма в рамке. */
  price: number;
}

export interface ServicePriceSelection {
  ids: number[];
  /** Только СВОИ цены мастера. Нет ключа — «как в Каталоге»: такая цена поедет
   *  за правкой Каталога, а записанная — нет, и разница эта видимая. */
  prices: Record<number, number>;
}

export interface ServicePricePickerProps {
  services: PickableService[];
  value: ServicePriceSelection;
  onChange: (next: ServicePriceSelection) => void;
  /** Код валюты студии. Не передали — знак не рисуется. */
  currency?: string;
  disabled?: boolean;
}

/**
 * «Чем занимается сотрудник» и «сколько это у него стоит» — одним списком.
 *
 * Пилюля включает услугу, рамка справа держит цену. Изначально в рамке стоит
 * цена Каталога, и пока её не трогали, она именно наследуется: поднимут ценник
 * услуги — поднимется и здесь. Стоит ввести свою сумму, и связь рвётся
 * осознанно, поэтому своя цена подписана и выглядит иначе, чем доставшаяся.
 *
 * Пустое поле возвращает услугу к цене Каталога. Ноль пустым полем не является
 * и остаётся законной ценой — «бесплатно у стажёра».
 *
 * Один компонент на создание и на редактирование сотрудника: две копии этого
 * списка разошлись бы на первой правке, и владелец увидел бы разные правила на
 * соседних экранах.
 */
export function ServicePricePicker({
  services, value, onChange, currency, disabled,
}: ServicePricePickerProps) {
  const { t } = useTranslation('common');
  const [editing, setEditing] = useState<number | null>(null);
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
    // Сняли услугу — своя цена уходит вместе с ней. Оставить её висеть значило
    // бы вернуть надбавку молча при повторном назначении.
    if (on) delete prices[service.id];
    onChange({
      ids: on ? value.ids.filter(id => id !== service.id) : [...value.ids, service.id],
      prices,
    });
  }

  function startEdit(service: PickableService) {
    if (disabled) return;
    cancelled.current = false;
    setEditing(service.id);
    setDraft(String(value.prices[service.id] ?? service.price));
  }

  function commit(service: PickableService) {
    if (cancelled.current) { cancelled.current = false; setEditing(null); return; }
    const cleaned = draft.replace(/[^\d]/g, '');
    const prices = { ...value.prices };
    const parsed = cleaned === '' ? null : Number(cleaned);
    // Пусто — вернуть цену Каталога. Ровно та же цена, что в Каталоге, —
    // тоже наследование: владелец ничего не менял, и связь рвать не за что.
    if (parsed === null || parsed === service.price) delete prices[service.id];
    else prices[service.id] = parsed;
    onChange({ ids: value.ids, prices });
    setEditing(null);
  }

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
        {services.map(service => {
          const on = value.ids.includes(service.id);
          const own = value.prices[service.id];
          const custom = own !== undefined;
          const shown = custom ? own : service.price;
          return (
            <div
              key={service.id}
              className="v-svc-row"
              style={{
                display: 'inline-flex', alignItems: 'stretch', borderRadius: '20px',
                // Включённая услуга — светлая пилюля с персиковой половиной цены,
                // а не сплошная тёмная заливка: акцент в продукте носит то, что
                // человек задал руками, и здесь это сумма, а не название.
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
                  fontFamily: 'Manrope, sans-serif', whiteSpace: 'nowrap',
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

              {on && (editing === service.id ? (
                <input
                  ref={inputRef}
                  className="v-svc-price-input"
                  value={draft}
                  inputMode="numeric"
                  // Девять цифр — ниже серверного потолка (MAX_STAFF_SERVICE_PRICE,
                  // миллиард): длиннее сумма ушла бы на сервер ради отказа.
                  maxLength={9}
                  autoFocus
                  aria-label={t('servicePrice.aria', { service: service.name })}
                  onChange={e => setDraft(e.target.value)}
                  onBlur={() => commit(service)}
                  onKeyDown={e => {
                    // stopPropagation обязателен: модалка сотрудника слушает
                    // Enter на всём окне (`submitOnEnter`), и без него ввод
                    // цены пролистывал бы шаг мастера вместо сохранения суммы.
                    if (e.key === 'Enter') {
                      e.preventDefault(); e.stopPropagation(); commit(service);
                    }
                    // Esc отменяет правку, а не закрывает модалку: окно с
                    // открытым полем цены закрылось бы, потеряв всю форму.
                    if (e.key === 'Escape') {
                      e.stopPropagation(); cancelled.current = true; setEditing(null);
                    }
                  }}
                  style={{
                    // Поля прибавляем к ширине явно: у input `box-sizing:
                    // border-box`, и «Nch» уходило под них — сумма 1400
                    // показывалась как 400, причём молча.
                    width: `calc(${Math.max(draft.length, 3)}ch + 24px)`,
                    padding: '8px 10px',
                    border: 'none', outline: 'none', textAlign: 'center',
                    background: 'linear-gradient(135deg, var(--peach-light) 0%, var(--peach) 100%)',
                    color: '#fff',
                    fontSize: '12px', fontWeight: 800, fontFamily: 'Manrope, sans-serif',
                  }}
                />
              ) : (
                <button
                  type="button"
                  className="v-svc-price"
                  disabled={disabled}
                  onClick={() => startEdit(service)}
                  title={t(custom ? 'servicePrice.custom' : 'servicePrice.inherited')}
                  style={{
                    padding: '8px 12px', border: 'none', whiteSpace: 'nowrap',
                    cursor: disabled ? 'not-allowed' : 'pointer',
                    // Своя цена — сплошной персик, как у любой кнопки действия в
                    // продукте; доставшаяся из Каталога — тот же персик, но
                    // прозрачный: половина цены остаётся персиковой всегда, а
                    // насыщенность отделяет заданное руками от унаследованного.
                    background: custom
                      ? 'linear-gradient(135deg, var(--peach-light) 0%, var(--peach) 100%)'
                      : 'rgba(249,160,139,0.18)',
                    color: custom ? '#fff' : 'var(--onyx)', fontSize: '12px',
                    fontWeight: custom ? 800 : 600, fontFamily: 'Manrope, sans-serif',
                  }}
                >
                  {formatMoney(shown, currency)}
                </button>
              ))}
            </div>
          );
        })}
      </div>
      {value.ids.length > 0 && (
        <div style={{
          marginTop: '8px', fontSize: '11px', fontWeight: 600,
          color: 'var(--text3)', fontFamily: 'Manrope, sans-serif',
        }}>
          {t('servicePrice.hint')}
        </div>
      )}
    </div>
  );
}
