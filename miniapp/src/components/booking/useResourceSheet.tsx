import { useTranslation } from 'react-i18next';
import { SheetAction } from '../ui/Sheet';
import TimeStep from './TimeStep';
import { DoneStep, QuoteStep } from './QuoteStep';
import { useBusinessTerms } from '../../hooks/useBusinessTerms';
import type { useResourceBooking } from '../../hooks/useResourceBooking';

type Flow = ReturnType<typeof useResourceBooking>;

/**
 * Части листа индивидуальной записи: шапка, содержимое шага и подвал.
 *
 * Хук, а не компонент, потому что `Sheet` принимает шапку и подвал отдельными
 * свойствами, а подвал обязан быть ПУСТЫМ значением там, где кнопки нет: иначе
 * лист оставил бы под пустым компонентом полосу отступа. Один источник — два
 * листа: общий (главная, «Мои записи») и лист экрана «Записатись», у которого
 * перед временем ещё шаг выбора услуги мастера.
 */
export function useResourceSheet(flow: Flow, { onOtherMaster, onDone }: { onOtherMaster?: () => void; onDone?: () => void } = {}) {
  const { t } = useTranslation();
  const terms = useBusinessTerms('resource', flow.service?.terminology_profile ?? null);
  const { service, step } = flow;

  // После котировки мастер, время и оплата уже определены сервером.
  // Шапка и строки подтверждения должны показывать одни и те же условия,
  // включая пересчёт просроченной котировки и итог успешной записи.
  const quoted = step === 'select_time' ? null : flow.quote?.terms;
  const funding = quoted?.domain.funding;
  const subtitle = [
    quoted?.domain.trainer_name ?? flow.teacherName ?? (flow.move ? null : t('booking.anyMaster')),
    quoted ? t('booking.duration', { min: quoted.duration_min }) : service?.duration_str
      ?? (service?.duration_min ? t('booking.duration', { min: service.duration_min }) : null),
    funding ? (funding.kind === 'pay' ? `${funding.price} ${funding.currency}` : t(`resource.funding.${funding.kind}`))
      : service?.price_str ?? null,
  ].filter(Boolean).join(' · ');

  const done = onDone ?? flow.close;
  const footer =
    step === 'quote' && flow.quote ? (
      <SheetAction onClick={() => void flow.confirm()}>
        {terms.ready ? terms.message('confirm_booking') : t('resource.confirm')}
      </SheetAction>
    ) : step === 'confirming' ? (
      <SheetAction disabled>{t('resource.confirming')}</SheetAction>
    ) : step === 'done' && flow.booking ? (
      <SheetAction onClick={done}>{t('resource.done')}</SheetAction>
    ) : undefined;

  const body =
    step === 'select_time' ? (
      <TimeStep flow={flow} onOtherMaster={onOtherMaster} />
    ) : step === 'done' ? (
      <DoneStep flow={flow} />
    ) : (
      <QuoteStep flow={flow} />
    );

  return {
    kicker: terms.offering?.singular ?? t('resource.kicker'),
    title: service ? t(`lesson.name.${service.name}`, { defaultValue: service.name }) : '',
    subtitle: subtitle || undefined,
    footer,
    body,
  };
}
