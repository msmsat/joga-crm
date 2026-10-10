import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { LessonAbout } from '../../../lib/lessonAbout';
import { useClamp } from '../../../hooks/useClamp';
import { RatingSummary } from '../../about/Rating';

/**
 * «О занятии» — то, что студия написала о направлении и о том, кто ведёт.
 *
 * Только из каталога, который уже загружен: блок появляется в кадре открытия.
 * Нечего сказать (студия не заполнила описание, у ведущего нет «О себе» и
 * оценок) — блока нет вовсе, без пустой рамки «Описание: —».
 *
 * Тихий фарфоровый текст, а не ещё один камень: тёмный предмет в листе один —
 * билет, и ведущий на его корешке уже есть.
 */
export default function LessonAboutBlock({ about }: { about: LessonAbout }) {
  const { t } = useTranslation();
  const { service, trainer } = about;
  const description = service?.description?.trim() || '';
  const bio = trainer?.bio?.trim() || '';
  const [open, setOpen] = useState(false);
  const { ref: textRef, cut } = useClamp<HTMLParagraphElement>(description, 4);

  if (!description && !bio && service?.rating_avg == null) return null;

  return (
    <section aria-label={t('lessonSheet.about.title')} className="flex flex-col gap-4 rounded-[22px] bg-background p-4">
      <h3 className="text-[13px] font-extrabold tracking-[-0.01em] text-foreground">{t('lessonSheet.about.title')}</h3>

      {service?.rating_avg != null && <RatingSummary avg={service.rating_avg} count={service.rating_count} />}

      {description && (
        <div>
          <p
            ref={textRef}
            className={`whitespace-pre-line text-[13px] font-medium leading-relaxed text-muted-foreground ${open ? '' : 'line-clamp-4'}`}
          >
            {description}
          </p>
          {cut && (
            <button
              type="button"
              onClick={() => setOpen((value) => !value)}
              className="mt-1.5 text-[12.5px] font-extrabold text-foreground underline decoration-foreground/25 underline-offset-4"
            >
              {t(open ? 'lessonSheet.about.less' : 'lessonSheet.about.more')}
            </button>
          )}
        </div>
      )}

      {trainer && bio && (
        <div>
          <div className="text-[12.5px] font-extrabold text-foreground">{trainer.name}</div>
          <p className="mt-1 whitespace-pre-line text-[13px] font-medium leading-relaxed text-muted-foreground">{bio}</p>
        </div>
      )}
    </section>
  );
}
