// Места нового занятия: «Индивидуальное» и число мест — одним рядом.
// Индивидуальное — то же групповое занятие, только на одно место: услуга,
// тренер и цена остаются, записаться на него сможет один клиент. В отдельную
// запись (resource) оно не превращается — режим записи задаёт услуга, а не форма.
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import * as Icons from '../../../../components/Icons';
import { MAX_SPOTS } from './lesson/editor/MatsCapacity';

/** Группа по умолчанию — та же, с какой открывается пустая форма (Journal). */
const DEFAULT_GROUP = '8';

interface Props {
  value: string;
  onChange: (value: string) => void;
  /** Вместимость выбранной услуги: к ней вернётся отжатое «Индивидуальное»,
   *  если размер группы руками не меняли. */
  serviceSpots: number | null;
  invalid?: boolean;
}

export function SpotsField({ value, onChange, serviceSpots, invalid = false }: Props) {
  const { t } = useTranslation('journal');
  // Размер группы, от которого ушли в «Индивидуальное», — его вернёт второе
  // нажатие. Запомнен вместе с услугой: сменили услугу — вернётся уже её
  // вместимость, а не число от прошлой.
  const [left, setLeft] = useState<{ spots: string; service: number | null } | null>(null);
  const parsed = Number(value);
  const solo = parsed === 1;
  const group = left && left.service === serviceSpots ? left.spots
    : serviceSpots != null && serviceSpots > 1 ? String(serviceSpots) : DEFAULT_GROUP;

  const toggleSolo = () => {
    if (solo) {
      setLeft(null);
      onChange(group);
      return;
    }
    const isGroup = Number.isInteger(parsed) && parsed > 1 && parsed <= MAX_SPOTS;
    setLeft(isGroup ? { spots: value, service: serviceSpots } : null);
    onChange('1');
  };

  // Пустое поле шагает от нуля: «+» даёт одно место, а не NaN. Число больше
  // предела «−» возвращает на предел, а не на шаг ниже недопустимого.
  const base = Number.isFinite(parsed) ? Math.trunc(parsed) : 0;
  const step = (delta: number) => onChange(String(Math.min(MAX_SPOTS, Math.max(1, base + delta))));

  return (
    <div className="kp-spots">
      <button
        type="button"
        className={`kp-solo${solo ? ' is-on' : ''}`}
        aria-pressed={solo}
        title={t('newBooking.individualHint')}
        onClick={toggleSolo}
      >
        <Icons.User />
        <span className="kp-solo-label">{t('newBooking.individual')}</span>
      </button>

      <div className={`kp-stepper${invalid ? ' is-invalid' : ''}`} role="group" aria-label={t('newBooking.maxSpots')}>
        <button type="button" className="kp-step" disabled={base <= 1}
                aria-label={t('bookingPopup.editor.fewer')} onClick={() => step(-1)}>
          <Icons.Minus />
        </button>
        <input
          className="kp-step-value"
          value={value}
          inputMode="numeric"
          maxLength={2}
          aria-label={t('newBooking.maxSpots')}
          aria-invalid={invalid}
          onFocus={e => e.target.select()}
          onChange={e => onChange(e.target.value.replace(/\D/g, ''))}
          onKeyDown={e => {
            if (e.key === 'ArrowUp') { e.preventDefault(); step(1); }
            if (e.key === 'ArrowDown') { e.preventDefault(); step(-1); }
          }}
        />
        <button type="button" className="kp-step" disabled={base >= MAX_SPOTS}
                aria-label={t('bookingPopup.editor.more')} onClick={() => step(1)}>
          <Icons.Plus />
        </button>
      </div>
    </div>
  );
}
