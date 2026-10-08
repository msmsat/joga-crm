import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion } from 'framer-motion';
import type { RecentEvent } from '../../types';
import EventMenu from '../ui/EventMenu';
import { toRelative } from '../ui/relativeTime';
import SectionHead from './SectionHead';
import s from './PhoneLists.module.css';

/** Сколько событий видно сразу: остальное — по «Смотреть все». */
const FOLD = 5;

interface Props {
  events: RecentEvent[];
}

/** Лента событий студии вертикальным таймлайном: точка цвета события на общей нити. */
export default function ActivityTimeline({ events }: Props) {
  const { t, i18n } = useTranslation('dashboard');
  const [open, setOpen] = useState(false);
  const shown = open ? events : events.slice(0, FOLD);

  return (
    <section className={s.section}>
      <SectionHead title={t('events.title')} />
      <div className={s.card}>
        {events.length === 0 ? (
          <div className={s.calm}>{t('state.noData')}</div>
        ) : (
          <ol className={s.feed}>
            <AnimatePresence initial={false}>
              {shown.map(ev => (
                <motion.li
                  key={ev.id}
                  className={s.eventItem}
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
                >
                  {/* Поля — на внутреннем блоке: у раскрывающейся строки высота
                      идёт от нуля, а padding на ней самой держал бы её открытой. */}
                  <div className={s.event}>
                    <span className={s.eventDot} style={{ background: ev.color }} />
                    <span className={s.eventBody}>
                      <span className={s.eventText}><strong>{ev.actor_name}</strong> {ev.title}</span>
                      <span className={s.eventTime}>{toRelative(ev.created_at, i18n.language, t)}</span>
                    </span>
                    <span className={s.eventMenu}><EventMenu event={ev} /></span>
                  </div>
                </motion.li>
              ))}
            </AnimatePresence>
          </ol>
        )}
        {events.length > FOLD && (
          <button type="button" className={s.more} onClick={() => setOpen(v => !v)}>
            {open ? t('phone.collapse') : (
              <>
                {t('events.seeAll')}
                <span className={s.moreCount}>{events.length}</span>
              </>
            )}
          </button>
        )}
      </div>
    </section>
  );
}
