import { useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { useTelegram } from '../../../hooks/useTelegram';
import { downloadIcs, googleCalendarUrl, mapsUrl, type CalendarEvent } from '../../../lib/calendar';

type Props = {
  /** Филиал: адрес для маршрута. Адреса нет — нет и маршрута. */
  place?: { address: string | null };
  /** Есть только у будущего занятия: прошедшее в календарь не кладут. */
  calendar?: CalendarEvent;
  /** Контакты студии — лист поддержки поверх этого. */
  onContact?: () => void;
  /** «Отменить можно до …» либо «онлайн-отмена закрыта». */
  cancelNote?: string;
};

function Row({ icon, title, hint, trailing, onClick, expanded }: {
  icon: ReactNode; title: string; hint?: string; trailing?: ReactNode; onClick: () => void; expanded?: boolean;
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileTap={{ scale: 0.985 }}
      aria-expanded={expanded}
      className="flex w-full items-center gap-3.5 rounded-[18px] bg-background px-4 py-3.5 text-left transition-colors duration-200 dt:hover:bg-muted"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand/12 text-brand">
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]">
          {icon}
        </svg>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] font-extrabold tracking-[-0.015em] text-foreground">{title}</span>
        {hint && <span className="mt-0.5 block truncate text-[12px] font-medium text-muted-foreground">{hint}</span>}
      </span>
      {trailing ?? (
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0 text-muted-foreground">
          <polyline points="9 18 15 12 9 6" />
        </svg>
      )}
    </motion.button>
  );
}

/**
 * Что нужно, чтобы дойти до занятия: адрес с маршрутом, напоминание в своём
 * календаре, связь со студией и до какого момента запись ещё можно отменить.
 *
 * Ссылки наружу в Telegram — его методом (`openLink`): во встроенном вебвью
 * обычный переход молча ничего не делает. Файл `.ics` в Telegram не
 * предлагается — вебвью его не скачивает, а Google-ссылку открывает.
 */
export default function LessonLogistics({ place, calendar, onContact, cancelNote }: Props) {
  const { t } = useTranslation();
  const { tg, isInTelegram, vibrateLight } = useTelegram();
  const [calendarOpen, setCalendarOpen] = useState(false);

  const openOutside = (url: string) => {
    vibrateLight();
    if (isInTelegram && tg?.openLink) tg.openLink(url);
    else window.open(url, '_blank', 'noopener');
  };

  const addToCalendar = () => {
    if (!calendar) return;
    if (isInTelegram) openOutside(googleCalendarUrl(calendar));
    else {
      vibrateLight();
      setCalendarOpen((open) => !open);
    }
  };

  const chevronDown = (
    <motion.svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4 shrink-0 text-muted-foreground"
      animate={{ rotate: calendarOpen ? 180 : 0 }}
      transition={{ type: 'spring', stiffness: 380, damping: 30 }}
    >
      <polyline points="6 9 12 15 18 9" />
    </motion.svg>
  );

  return (
    // На широкой колонке — две плитки в ряд. `items-start`: раскрытый выбор
    // календаря растёт в своей клетке и не растягивает соседнюю плитку.
    <div className="grid items-start gap-2 dt:grid-cols-2">
      {/* Без адреса строки нет: название филиала уже стоит на билете, а
          кнопка, которой некуда вести, — мусор. */}
      {place?.address && (
        <Row
          icon={<><path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" /></>}
          title={t('lessonSheet.place.route')}
          hint={place.address}
          onClick={() => openOutside(mapsUrl(place.address!))}
        />
      )}

      {calendar && (
        <div>
          <Row
            icon={<><rect x="3.5" y="5" width="17" height="15.5" rx="3" /><path d="M3.5 10h17M8 3v4M16 3v4" /><path d="M12 13.5v4M10 15.5h4" /></>}
            title={t('lessonSheet.calendar.add')}
            hint={t(isInTelegram ? 'lessonSheet.calendar.google' : 'lessonSheet.calendar.hint')}
            onClick={addToCalendar}
            expanded={isInTelegram ? undefined : calendarOpen}
            trailing={isInTelegram ? undefined : chevronDown}
          />
          <AnimatePresence initial={false}>
            {calendarOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.26, ease: [0.16, 1, 0.3, 1] }}
                className="overflow-hidden"
              >
                <div className="grid grid-cols-2 gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => { openOutside(googleCalendarUrl(calendar)); setCalendarOpen(false); }}
                    className="rounded-[16px] bg-card px-3 py-3 text-[13px] font-extrabold text-foreground shadow-soft transition-shadow dt:hover:shadow-lift"
                  >
                    {t('lessonSheet.calendar.google_short')}
                  </button>
                  <button
                    type="button"
                    onClick={() => { vibrateLight(); downloadIcs(calendar); setCalendarOpen(false); }}
                    className="rounded-[16px] bg-card px-3 py-3 text-[13px] font-extrabold text-foreground shadow-soft transition-shadow dt:hover:shadow-lift"
                  >
                    {t('lessonSheet.calendar.apple')}
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {onContact && (
        <Row
          icon={<path d="M21 12a8.5 8.5 0 0 1-12.4 7.6L3.5 21l1.4-4.9A8.5 8.5 0 1 1 21 12z" />}
          title={t('lessonSheet.contact.title')}
          hint={t('lessonSheet.contact.hint')}
          onClick={() => { vibrateLight(); onContact(); }}
        />
      )}

      {/* На телефоне — строкой под плитками, на широкой колонке — в клетке
          рядом с «Связаться», вровень с ней по высоте. */}
      {cancelNote && (
        <div className="flex items-start gap-2.5 px-1 pt-1 text-[12px] font-medium leading-relaxed text-muted-foreground dt:min-h-[68px] dt:items-center dt:px-4 dt:pt-0">
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="mt-[1px] h-4 w-4 shrink-0">
            <circle cx="12" cy="12" r="8.5" />
            <path d="M12 7.5V12l3 2" />
          </svg>
          <span>{cancelNote}</span>
        </div>
      )}
    </div>
  );
}
