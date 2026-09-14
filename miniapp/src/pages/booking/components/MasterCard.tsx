import { useState } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Press } from '../../../components/ui/Press';
import { resolveImageUrl } from '../../../api/client';
import { fullName, initials } from '../../../lib/bookingPage';
import type { ResourceStaffMember } from '../../../api/hybrid.types';
import type { StudioService } from '../../../api/studio';

type Nearest = {
  /** `undefined` — подсказки нет вовсе (услуга не выбрана); `null` — окон нет. */
  nearest?: string | null;
};

type Props = Nearest & {
  member: ResourceStaffMember;
  pills: { shown: StudioService[]; more: number };
  highlight: number | null;
  selected: boolean;
  index: number;
  onClick: () => void;
};

const entrance = (index: number) => ({
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.32, delay: Math.min(index, 6) * 0.035, ease: [0.16, 1, 0.3, 1] as const },
});

const chevron = (
  <svg viewBox="0 0 24 24" fill="none" stroke="var(--v-muted-foreground)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0">
    <polyline points="9 18 15 12 9 6" />
  </svg>
);

/**
 * Мастер в списке «Записатись».
 *
 * Фото, имя, должность и то, что он делает, — ровно столько, чтобы выбрать
 * человека, не открывая его. Нажимается вся карточка: попадать пальцем в
 * маленькую кнопку не нужно.
 *
 * Услуги — чипами, а не строкой через точку: название услуги само может
 * содержать точку или «и», и в сплошной строке границы терялись. Больше трёх —
 * «ещё N»: полный список человек увидит в листе, одним касанием.
 *
 * Время здесь — только подсказка. Мастер без свободного окна на ближайшие дни
 * остаётся в списке: день ещё не выбран, и его отсутствие было бы неправдой.
 */
export default function MasterCard({ member, pills, highlight, nearest, selected, index, onClick }: Props) {
  const { t } = useTranslation();
  const [broken, setBroken] = useState(false);
  const photo = broken ? undefined : resolveImageUrl(member.photo_url);
  const name = fullName(member);

  return (
    <motion.div {...entrance(index)}>
      <Press
        role="button"
        tabIndex={0}
        aria-label={selected ? `${name} — ${t('booking.selected')}` : name}
        onClick={onClick}
        className={`block cursor-pointer rounded-[22px] bg-card px-4 py-4 shadow-soft dt:px-5 ${
          selected ? 'ring-2 ring-brand' : ''
        }`}
      >
        <div className="flex items-center gap-3.5">
          <span className="relative shrink-0">
            {photo ? (
              <img src={photo} alt="" onError={() => setBroken(true)} className="h-14 w-14 rounded-full object-cover" />
            ) : (
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-brand/12 text-[16px] font-extrabold text-brand">
                {initials(member)}
              </span>
            )}
            {selected && <SelectedBadge />}
          </span>

          <div className="min-w-0 flex-1">
            <div className="line-clamp-2 break-words text-[15.5px] font-extrabold leading-snug tracking-[-0.015em] text-card-foreground">
              {name}
            </div>
            {member.department && (
              <div className="mt-0.5 truncate text-[12.5px] font-semibold text-muted-foreground">{member.department}</div>
            )}
            <NearestLine nearest={nearest} />
          </div>

          {chevron}
        </div>

        {/* Услуги — на всю ширину карточки, а не колонкой под именем: там им
            оставалось ~200px, и три коротких названия вставали в три строки. */}
        {pills.shown.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {pills.shown.map((service) => {
                const match = service.id === highlight;
                return (
                  <span
                    key={service.id}
                    className={`inline-flex max-w-full items-center gap-1 truncate rounded-full px-2.5 py-1 text-[12.5px] font-semibold ${
                      match ? 'bg-brand/18 text-foreground' : 'bg-background text-foreground/80'
                    }`}
                  >
                    {match && (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3 shrink-0">
                        <polyline points="5 12.5 10 17 19 7.5" />
                      </svg>
                    )}
                    <span className="truncate">{t(`lesson.name.${service.name}`, { defaultValue: service.name })}</span>
                  </span>
                );
              })}
              {pills.more > 0 && (
                <span className="inline-flex items-center rounded-full px-2 py-1 text-[12.5px] font-bold text-muted-foreground">
                  {t('booking.moreServices', { n: pills.more })}
                </span>
              )}
            </div>
          )}
      </Press>
    </motion.div>
  );
}

/** «Будь-який майстер»: время важнее человека — выбор мастера лишний шаг (MA-05). */
export function AnyMasterCard({ nearest, selected, onClick }: Nearest & { selected: boolean; onClick: () => void }) {
  const { t } = useTranslation();
  return (
    <motion.div {...entrance(0)}>
      <Press
        role="button"
        tabIndex={0}
        aria-label={selected ? `${t('booking.anyMaster')} — ${t('booking.selected')}` : t('booking.anyMaster')}
        onClick={onClick}
        className={`flex cursor-pointer items-center gap-3.5 rounded-[22px] bg-card px-4 py-4 shadow-soft dt:px-5 ${
          selected ? 'ring-2 ring-brand' : ''
        }`}
      >
        <span className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-brand/12">
          <svg viewBox="0 0 24 24" fill="none" stroke="var(--v-brand)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6">
            <circle cx="9" cy="8" r="3" />
            <path d="M3 20v-1a5 5 0 0110 0v1M16 11a3 3 0 100-6M18 20v-1a5 5 0 00-2-4" />
          </svg>
          {selected && <SelectedBadge />}
        </span>
        <div className="min-w-0 flex-1 self-center">
          <div className="text-[15.5px] font-extrabold tracking-[-0.015em] text-card-foreground">{t('booking.anyMaster')}</div>
          {nearest === undefined ? (
            <div className="mt-0.5 text-[12.5px] font-semibold text-muted-foreground">{t('booking.anyMasterHint')}</div>
          ) : (
            <NearestLine nearest={nearest} />
          )}
        </div>
        {chevron}
      </Press>
    </motion.div>
  );
}

function NearestLine({ nearest }: Nearest) {
  const { t } = useTranslation();
  if (nearest === undefined) return null;
  return (
    <div
      className={`mt-1 flex items-center gap-1.5 text-[12.5px] font-bold ${
        nearest ? 'text-card-foreground' : 'text-muted-foreground'
      }`}
    >
      <span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full ${nearest ? 'bg-success' : 'bg-muted-foreground/40'}`} />
      <span className="truncate">{nearest ? t('booking.nearest', { when: nearest }) : t('booking.noNearest')}</span>
    </div>
  );
}

function SelectedBadge() {
  return (
    <span className="absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-brand text-brand-foreground ring-2 ring-card">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3">
        <polyline points="5 12.5 10 17 19 7.5" />
      </svg>
    </span>
  );
}
