import { useTranslation } from 'react-i18next';

/**
 * Онлайн-запись выключена студией: смотреть можно, записаться нельзя — и об
 * этом честно говорим один раз сверху, а не отказом на каждой карточке.
 */
export default function BookingClosedNotice() {
  const { t } = useTranslation();
  return (
    <div className="mx-5 mt-5 rounded-[18px] bg-card px-4 py-3.5 shadow-soft dt:rounded-[20px] dt:px-5 dt:py-4">
      <div className="text-[13px] font-extrabold tracking-[-0.015em] text-foreground">{t('schedule.booking_closed')}</div>
      <div className="mt-1 text-[12px] font-medium leading-relaxed text-muted-foreground">
        {t('schedule.booking_closed_hint')}
      </div>
    </div>
  );
}
