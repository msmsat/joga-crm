// Раздел «Время» мастера записи — с него мастер всегда открывается. День —
// лентой дней на два месяца вперёд. Час — тапом по свободному (сетка с шагом
// 15 минут по умолчанию, суженная выбранными услугой и мастером) или своим:
// цифрами, двоеточие ставится само. Время ячейки, по которой тапнули, уже
// выбрано — его подтверждают «Продолжить» или Enter, либо меняют тут же.
// Тап по свободному ведёт к следующему разделу, как выбор строки в списках.
// Смена дня: сетка въезжает с той стороны, куда шагнули по ленте, плитки —
// волной; пока день грузится, на месте сетки мерцают заглушки.
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import * as Icons from '../../../../../../components/Icons';
import { PillSelect } from '../../../../../../components/ui/index';
import { toDateStr } from '../../../utils';
import { isTime, TIME_STEPS, type BookingWizardState } from './useBookingWizard';
import { maskTime, parseTime } from './whenInput';
import { WizardEmpty } from './WizardParts';

const DAYS = 60;
/** Сколько заглушек мерцает, пока день грузится. */
const SKELETON = 12;
/** Части дня — заголовки над сеткой: сплошняком её не прочесть. */
const PARTS = [
  { key: 'morning', until: 12 * 60 },
  { key: 'afternoon', until: 17 * 60 },
  { key: 'evening', until: 24 * 60 },
] as const;
const minuteOf = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

export function TimeStep({ w }: { w: BookingWizardState }) {
  const { t, i18n } = useTranslation(['journal', 'common']);
  const [text, setText] = useState(w.time);
  const typed = text.length === 5 ? parseTime(text) : null;
  const today = toDateStr(new Date());

  // Куда шагнули по ленте: 1 — на день вперёд, -1 — назад. Считается в рендере
  // (смена пропса → своё состояние), чтобы первый же кадр нового дня въезжал
  // с нужной стороны.
  const [shown, setShown] = useState({ date: w.date, dir: 1 });
  if (shown.date !== w.date) setShown({ date: w.date, dir: w.date > shown.date ? 1 : -1 });

  // От сегодня (или от уже выбранного прошлого дня); выбранный дальше ленты — в её конце.
  const days = useMemo(() => {
    const start = new Date(`${w.date && w.date < today ? w.date : today}T12:00:00`);
    const list = Array.from({ length: DAYS }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return toDateStr(d);
    });
    return w.date && !list.includes(w.date) ? [...list, w.date] : list;
  }, [w.date, today]);

  const master = w.masterChosen ? w.masters.find(m => m.id === w.teacherId)?.name : undefined;
  const { times, loading } = w.availability;
  const groups = PARTS.map((p, i) => ({
    key: p.key,
    times: times.filter(tm => minuteOf(tm) < p.until && (i === 0 || minuteOf(tm) >= PARTS[i - 1].until)),
  })).filter(g => g.times.length > 0);
  /** Номер плитки по всему дню — по нему волна задерживает её появление. */
  const firstOf = groups.map((_, i) => groups.slice(0, i).reduce((n, g) => n + g.times.length, 0));

  // Выбранный день — посередине ленты (при открытии сразу, дальше — плавно),
  // выбранное время — в видимой части списка, иначе список с начала.
  const stripRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const placed = useRef(false);
  useEffect(() => {
    const strip = stripRef.current;
    const day = strip?.querySelector<HTMLElement>('.bw-day.active');
    if (!strip || !day) return;
    const left = day.offsetLeft - (strip.clientWidth - day.clientWidth) / 2;
    if (placed.current && typeof strip.scrollTo === 'function') strip.scrollTo({ left, behavior: 'smooth' });
    else strip.scrollLeft = left;
    placed.current = true;
  }, [w.date]);
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const chip = list.querySelector<HTMLElement>('.bw-time.active');
    list.scrollTop = chip ? chip.offsetTop - list.clientHeight / 2 : 0;
  }, [loading, w.date]);

  const fmt = (iso: string, opts: Intl.DateTimeFormatOptions) =>
    new Date(`${iso}T12:00:00`).toLocaleDateString(i18n.language, opts);
  const onType = (raw: string) => {
    const v = maskTime(raw);
    setText(v);
    const at = v.length === 5 ? parseTime(v) : null;
    w.setWhen(w.date, at ?? '');
  };

  const slide = shown.dir > 0 ? 'bw-slide-next' : 'bw-slide-prev';

  return (
    <>
      <div className="bw-tools">
        <div className="bw-days" ref={stripRef}>
          {days.map(d => (
            <button key={d} type="button" className={`bw-day${d === w.date ? ' active' : ''}${d === today ? ' today' : ''}`}
                    aria-pressed={d === w.date} onClick={() => w.setWhen(d, w.time)}>
              <span className="bw-day-wd">{fmt(d, { weekday: 'short' })}</span>
              <span className="bw-day-num">{Number(d.slice(8, 10))}</span>
              <span className="bw-day-mon">{fmt(d, { month: 'short' })}</span>
            </button>
          ))}
        </div>
        <div className="bw-own-time">
          <span key={w.date} className={`bw-own-time-day ${slide}`}>
            {fmt(w.date, { weekday: 'long', day: 'numeric', month: 'long' })}
          </span>
          <label className="bw-own-time-field">
            <span className="jf-title">{t('journal:wizard.ownTime')}</span>
            <input className="modal-input bw-own-time-input" inputMode="numeric" autoComplete="off"
                   placeholder="10:30" value={text} aria-invalid={text.length === 5 && !typed}
                   onFocus={e => e.target.select()} onChange={e => onType(e.target.value)}
                   onKeyDown={e => { if (e.key === 'Enter' && isTime(w.time)) w.advance(); }} />
          </label>
          <PillSelect label={t('journal:wizard.timeStep')} icon={<Icons.Clock />} value={w.timeStep}
                      options={TIME_STEPS.map(s => ({ value: s, label: String(s), hint: t('common:units.min') }))}
                      onChange={w.setTimeStep} />
        </div>
        {w.conflict && <div className="kp-error" role="alert">{t('journal:wizard.selectionConflict')}</div>}
        {w.availability.error && <div className="kp-error" role="alert">{t('journal:wizard.availabilityError')}</div>}
        {text.length === 5 && !typed && <div className="kp-error" role="alert">{t('journal:wizard.badTime')}</div>}
      </div>
      <div className="bw-list bw-times" ref={listRef}>
        <div className="bw-times-for">
          {[t('journal:wizard.freeTimes'), w.service?.name, master].filter(Boolean).join(' · ')}
        </div>
        {/* key — новый день въезжает целиком, а не перерисовывается на месте. */}
        <div key={`${w.date}|${loading}`} className={`bw-times-day ${slide}`}>
          {loading ? (
            <div className="bw-times-grid" aria-busy="true" aria-label={t('common:loading')}>
              {Array.from({ length: SKELETON }, (_, i) => (
                <span key={i} className="bw-time-skel" style={{ '--i': i } as CSSProperties} />
              ))}
            </div>
          ) : groups.map((g, gi) => (
            <section key={g.key} className="bw-times-part">
              <div className="jf-title">{t(`journal:wizard.parts.${g.key}`)}</div>
              <div className="bw-times-grid">
                {g.times.map((tm, i) => (
                  <button key={tm} type="button" className={`bw-time${tm === w.time ? ' active' : ''}`}
                          style={{ '--i': Math.min(firstOf[gi] + i, 24) } as CSSProperties} onClick={() => w.pickTime(tm)}>
                    {tm}
                  </button>
                ))}
              </div>
            </section>
          ))}
          {!loading && groups.length === 0 && <WizardEmpty>{t('journal:resourceBooking.noSlots')}</WizardEmpty>}
        </div>
      </div>
    </>
  );
}
