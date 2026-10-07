import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion } from 'framer-motion';
import { Repeat, Sparkles } from 'lucide-react';
import { errorMessage } from '../../../../../api/errorMessage';
import { monthLabel } from '../../../Clients/utils/clientEvents';
import {
  PAST_TONES, lessonTime, repeatOf, usePastLessons, type PastLesson, type PastTone, type RepeatOf,
} from './usePastLessons';
import './pastLessons.css';

/** Сколько строк сразу и сколько добавляет «Показать ещё»: в поповере место
 *  есть (он листается), в строке списка — нет, там история только подсказка. */
const STEP = { popover: 20, inline: 5 };

type Translate = (key: string, options?: Record<string, unknown>) => string;

/** «Завершено» рядом с «Посещено» читалось бы как ещё одна явка — как и в
 *  сводке карточки клиента, называем такое занятие «явка не отмечена». */
const toneLabel = (tone: PastTone, t: Translate) =>
  tone === 'done' ? t('clients:panel.events.noMark') : t(`clients:panel.events.state.${tone}`);

/** «Записать так же»: нажатие на прошлое занятие подставляет его в запись. */
export interface RepeatProps {
  /** Записывает ли эта форма такую услугу; нет — строка остаётся только для чтения. */
  canRepeat?: (serviceId: number) => boolean;
  /** Без него лента только для чтения. */
  onRepeat?: (repeat: RepeatOf) => void;
}

/**
 * Прошлые занятия клиента — компактной лентой: полоса посещаемости с легендой
 * сверху, ниже занятия по месяцам, новые первыми. Одна и та же лента живёт в
 * поповере у поля клиента (компьютер) и раскрывается под строкой клиента в
 * мастере записи (`inline`).
 */
export function PastLessonsList({ clientId, inline = false, canRepeat, onRepeat }: {
  clientId: number; inline?: boolean;
} & RepeatProps) {
  const { t, i18n } = useTranslation(['journal', 'clients', 'common']);
  const locale = i18n.resolvedLanguage || i18n.language;
  const { lessons, counts, visits, isPending, error, refetch } = usePastLessons(clientId);
  const step = inline ? STEP.inline : STEP.popover;
  const [limit, setLimit] = useState(step);

  const months = useMemo(() => {
    const today = new Date();
    const groups: { key: string; label: string; items: PastLesson[] }[] = [];
    for (const lesson of lessons.slice(0, limit)) {
      const key = `${lesson.at.y}-${lesson.at.mo}`;
      let group = groups[groups.length - 1];
      if (!group || group.key !== key) {
        group = { key, label: monthLabel(lesson.at, locale, today), items: [] };
        groups.push(group);
      }
      group.items.push(lesson);
    }
    return groups;
  }, [lessons, limit, locale]);

  const weekday = useMemo(() => new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' }), [locale]);
  const shownTones = PAST_TONES.filter(tone => counts[tone] > 0);
  const rest = lessons.length - limit;
  /** Что подставит нажатие на строку; null — строку повторить нельзя. */
  const repeatable = (lesson: PastLesson) => {
    const repeat = onRepeat ? repeatOf(lesson) : null;
    return repeat && (canRepeat?.(repeat.serviceId) ?? true) ? repeat : null;
  };
  const anyRepeatable = lessons.some(lesson => repeatable(lesson) != null);

  return (
    <div className={`plh${inline ? ' is-inline' : ''}`}>
      <div className="plh-head">
        <div className="plh-head-row">
          <span className="plh-title">{t('journal:pastLessons.title')}</span>
          {/* Визиты — то же число, что на кнопке и в списке клиентов: пришёл
              или прошло без отметки. Пропуски и отмены — в легенде ниже. */}
          {lessons.length > 0 && (
            <span className="plh-total">{t('journal:bookingPopup.visitsCount', { count: visits })}</span>
          )}
        </div>
        {lessons.length > 0 && (
          <>
            <div className="plh-bar" aria-hidden="true">
              {shownTones.map(tone => <span key={tone} className={`is-${tone}`} style={{ flexGrow: counts[tone] }} />)}
            </div>
            <div className="plh-legend">
              {shownTones.map(tone => (
                <span key={tone} className={`plh-legend-item is-${tone}`}>
                  <i />{toneLabel(tone, t)}<b>{counts[tone]}</b>
                </span>
              ))}
            </div>
            {/* Подсказка нужна телефону: наведения там нет, и без неё строку
                не отличить от просто прочитанной. */}
            {anyRepeatable && (
              <div className="plh-hint"><Repeat size={12} strokeWidth={2.4} />{t('journal:pastLessons.repeatHint')}</div>
            )}
          </>
        )}
      </div>

      <div className="plh-body">
        {isPending ? (
          <div className="plh-skeleton" aria-busy="true"><div /><div /><div /></div>
        ) : error ? (
          <div className="plh-error" role="alert">
            {errorMessage(error, t)}{' '}
            <button type="button" className="plh-link" onClick={() => void refetch()}>{t('common:errors.retry')}</button>
          </div>
        ) : lessons.length === 0 ? (
          <div className="plh-empty">
            <span className="plh-empty-icon"><Sparkles size={16} strokeWidth={2.2} /></span>
            {t('journal:pastLessons.empty')}
          </div>
        ) : months.map(month => (
          <section key={month.key} className="plh-month">
            <div className="plh-month-label">{month.label}</div>
            {month.items.map((lesson, i) => (
              <LessonRow key={lesson.key} lesson={lesson} index={i} weekday={weekday}
                         repeat={repeatable(lesson)} onRepeat={onRepeat} />
            ))}
          </section>
        ))}
        {!isPending && !error && rest > 0 && (
          <button type="button" className="plh-more" onClick={() => setLimit(l => l + step)}>
            {t('journal:pastLessons.more', { n: Math.min(step, rest) })}
          </button>
        )}
      </div>
    </div>
  );
}

/** Одно прошлое занятие. Можно повторить — строка становится кнопкой: при
 *  наведении на месте состояния проступает «Повторить». */
function LessonRow({ lesson, index, weekday, repeat, onRepeat }: {
  lesson: PastLesson; index: number; weekday: Intl.DateTimeFormat;
  repeat: RepeatOf | null; onRepeat?: (repeat: RepeatOf) => void;
}) {
  const { t } = useTranslation(['journal', 'clients']);
  const { event, tone, at } = lesson;
  const name = event.subject || event.title;
  const time = lessonTime(at);
  const label = toneLabel(tone, t);
  const style = { ['--i' as string]: Math.min(index, 8) };
  const body = (
    <>
      <span className="plh-date">
        <b>{at.d}</b>
        <small>{weekday.format(new Date(Date.UTC(at.y, at.mo - 1, at.d)))}</small>
      </span>
      <span className="plh-main">
        <span className="plh-name">{name}</span>
        <span className="plh-sub">{[time, event.trainer].filter(Boolean).join(' · ')}</span>
      </span>
      <span className="plh-side">
        <span className="plh-state" title={label}><i /><span className="plh-state-label">{label}</span></span>
        {repeat && (
          <span className="plh-repeat" aria-hidden="true"><Repeat size={11} strokeWidth={2.6} />{t('journal:pastLessons.repeat')}</span>
        )}
      </span>
    </>
  );
  if (!repeat || !onRepeat) return <div className={`plh-row is-${tone}`} style={style}>{body}</div>;
  return (
    <button type="button" className={`plh-row is-${tone} is-pickable`} style={style}
            aria-label={`${t('journal:pastLessons.repeat')}: ${[name, time].filter(Boolean).join(', ')}`}
            onClick={() => onRepeat(repeat)}>
      {body}
    </button>
  );
}

/** Лента под строкой клиента в мастере записи: раскрывается по высоте, а не
 *  появляется рывком — строки ниже плавно уступают ей место. */
export function PastLessonsInline({ clientId, open, canRepeat, onRepeat }: {
  clientId: number; open: boolean;
} & RepeatProps) {
  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.div
          key="history"
          className="bw-row-below"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.24, ease: [0.2, 0.8, 0.2, 1] }}
          style={{ overflow: 'hidden' }}
        >
          <PastLessonsList clientId={clientId} inline canRepeat={canRepeat} onRepeat={onRepeat} />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
