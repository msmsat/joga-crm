import { useTranslation } from 'react-i18next';
import type { LessonAbout } from '../../lib/lessonAbout';
import { RatingSummary } from './Rating';
import { StaffCard } from './StaffCard';
import { SheetAction } from '../ui/Sheet';

type Props = {
  about: LessonAbout;
  /** Подпись кнопки дальше; нет — кнопки нет (занятие полное или закрыто). */
  action?: string | null;
  /** То же действие, что у самой карточки занятия. */
  onAction: () => void;
};

/**
 * Раскрытая часть карточки занятия — под полным описанием: средняя оценка
 * направления, визитка того, кто ведёт, и кнопка дальше.
 *
 * Отзывов здесь нет и не будет без согласия авторов: клиенты писали их «для
 * тренера и студии». Сервер отдаёт только число и счёт.
 */
export default function LessonAboutPanel({ about, action, onAction }: Props) {
  const { t } = useTranslation();
  const { service, trainer } = about;

  return (
    <div className="flex flex-col gap-4 px-4 pb-4 pt-1.5">
      {service?.rating_avg != null && <RatingSummary avg={service.rating_avg} count={service.rating_count} />}
      {trainer && <StaffCard member={trainer} kicker={t('about.leads')} />}
      {action && <SheetAction onClick={onAction}>{action}</SheetAction>}
    </div>
  );
}
